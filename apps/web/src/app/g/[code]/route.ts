import { unstable_cache } from 'next/cache'
import { after } from 'next/server'
import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import { normalizeCode } from '@vardenia/core'
import config from '../../../payload.config'
import { clientIp, evaluateScan } from '../../../lib/scan-guard'
import { relatedId, type QrDoc } from '../../../lib/qr-doc'
import { markScanArrival, resolveDestination } from '../../../lib/qr-destination'
import { rawDb } from '../../../lib/db'
import { reportError } from '../../../lib/report'

/**
 * The QR redirect. `https://vrd.lb/g/K3M9QP2` -> the right page, plus one row in
 * the scan log.
 *
 * Two things matter here above all else:
 *  1. **Speed.** Someone is standing in a hotel lobby holding up a phone. The
 *     redirect is issued immediately and the analytics write happens after the
 *     response is sent, via `after()`.
 *  2. **It must never 404.** A printed code is permanent. Unknown or retired
 *     codes land on a helpful page, never a dead end - the magazine is in
 *     circulation for a year and a broken scan is a broken brand promise.
 */

export const dynamic = 'force-dynamic'

/**
 * A code's destination, cached.
 *
 * Every scan used to be a live round trip to Frankfurt before the reader was
 * sent anywhere. That is the wrong shape for this route twice over.
 *
 * The obvious cost is latency: someone is standing in a hotel lobby holding up
 * a phone, and the redirect is the whole product. The less obvious one is that
 * it made the printed promise depend on the database being up. A code is on
 * paper, in circulation for a year, and with no cache an outage sent every
 * single scan to "not found" - which is the most expensive failure this product
 * has, and the paper cannot be recalled.
 *
 * # What this does and does not buy
 *
 * It is not immunity. Next serves a cached value for the life of the entry and
 * then goes back to the database, so an outage still reaches codes whose entry
 * has expired. What it buys is that the codes people are actually scanning stay
 * answered, and that the ordinary case costs nothing.
 *
 * # An hour, and why staleness is not the risk it looks like
 *
 * Destinations are meant to change - that is the point of the redirect layer,
 * and ADR 0002 spells it out. But an edit in the admin panel fires
 * `revalidateQrCodes`, which drops the entry immediately, so the hour only
 * applies to a change made behind Payload's back, straight in the database.
 *
 * # Keyed by code, tagged for the collection
 *
 * The key has to carry the code or every code would share one entry. The tag is
 * collection-wide because a code is edited by hand, rarely, and clearing all of
 * them costs one round trip per code afterwards.
 */
const QR_TTL = 60 * 60

async function lookup(payload: Awaited<ReturnType<typeof getPayload>>, code: string) {
  const run = async () => {
    const result = await payload.find({
      collection: 'qr-codes',
      where: { code: { equals: code } },
      limit: 1,
      depth: 1,
    })
    // `null` rather than undefined: undefined is not JSON, and the cache stores
    // JSON. A miss has to be cacheable too, or a wrong code is the one request
    // shape that always hits the database.
    return result.docs[0] ?? null
  }

  return unstable_cache(run, ['qr-code', code], {
    revalidate: QR_TTL,
    tags: ['qr-codes'],
  })()
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params
  const code = normalizeCode(rawCode)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin

  if (!code) {
    return Response.redirect(`${siteUrl}/scan/not-found`, 302)
  }

  const payload = await getPayload({ config })

  const qr = await lookup(payload, code)
  if (!qr) {
    return Response.redirect(`${siteUrl}/scan/not-found?code=${code}`, 302)
  }
  if (!qr.active) {
    return Response.redirect(`${siteUrl}/scan/moved?code=${code}`, 302)
  }

  /**
   * `markScanArrival` wraps rather than replaces the resolver, and cannot throw
   * - it hands back the untouched destination on any failure. The reader's
   * redirect does not depend on the marker working. See lib/qr-destination.
   */
  const destination = markScanArrival(resolveDestination(qr, siteUrl), siteUrl)

  // Decide whether this scan counts. It never decides whether it works: the
  // redirect below happens either way, because a printed code must resolve for
  // everyone, always.
  const verdict = evaluateScan({
    code,
    ip: clientIp(request.headers),
    userAgent: request.headers.get('user-agent'),
  })

  // Logged after the redirect is already on the wire.
  after(async () => {
    if (!verdict.count) {
      payload.logger.debug({ code, reason: verdict.reason }, 'Scan not counted')
      return
    }
    try {
      await recordScan(payload, qr, request)
    } catch (error) {
      /**
       * The reader got where they were going, so nothing looks wrong. What is
       * lost is the evidence behind a renewal conversation - an advertiser whose
       * placement worked and whose report says it did not.
       */
      await reportError(error, { source: 'qr.scan-event', path: `/g/${code}`, extra: { code } })
    }
  })

  // 302, not 301: browsers cache 301s forever, and we would stop seeing scans
  // from repeat visitors - which is exactly the number advertisers pay for.
  //
  // Wrapped because `Response.redirect` throws on a malformed URL, and an
  // uncaught throw here is a 500 on a code that is already printed. Whatever is
  // wrong with the data, the reader gets a page that explains itself.
  try {
    return Response.redirect(destination, 302)
  } catch (error) {
    /**
     * The most expensive failure in the product to leave unnoticed. The code is
     * on paper, the paper is in circulation for a year, and every reader who
     * scans it lands on "not found" while the logs quietly fill up. This one
     * should page somebody.
     */
    await reportError(error, {
      source: 'qr.unusable-destination',
      path: `/g/${code}`,
      extra: { code, destination },
    })
    return Response.redirect(`${siteUrl}/scan/not-found?code=${code}`, 302)
  }
}

async function recordScan(
  payload: Awaited<ReturnType<typeof getPayload>>,
  qr: QrDoc,
  request: NextRequest,
) {
  const userAgent = request.headers.get('user-agent') ?? ''
  const businessId = relatedId(qr.business)

  await payload.create({
    collection: 'scan-events',
    data: {
      code: qr.code,
      qrCode: qr.id,
      business: businessId ?? null,
      scannedAt: new Date().toISOString(),
      placement: qr.placement,
      /**
       * Geo comes from whatever CDN is in front, city-level only, and is null
       * when there is none. Vercel and Cloudflare each set their own pair.
       *
       * # Country arrives, city does not, and they are two separate settings
       *
       * This note used to say that putting the domain behind Cloudflare
       * supplied both. It does not, and the first real scans proved it: two
       * scans of a printed home code recorded `country=LB` and `city=NULL`.
       *
       * Cloudflare sends `cf-ipcountry` as soon as IP Geolocation is on, which
       * it is. `cf-ipcity` comes from a different switch - Rules -> Transform
       * Rules -> Managed Transforms -> **Add visitor location headers** - which
       * also adds cf-region, cf-timezone and the lat/long pair. Nothing here
       * changes when it is turned on; the header simply starts arriving.
       *
       * Netlify, the origin, sets neither, so a deployment reached directly on
       * *.netlify.app rather than through the proxied domain records nothing.
       */
      city: request.headers.get('x-vercel-ip-city') ?? request.headers.get('cf-ipcity'),
      country: request.headers.get('x-vercel-ip-country') ?? request.headers.get('cf-ipcountry'),
      platform: detectPlatform(userAgent),
      // A camera-app scan arrives with no referrer; a shared link usually has one.
      isDirectScan: !request.headers.get('referer'),
    },
    // Bypasses the `create: () => false` rule - this route is the only writer.
    overrideAccess: true,
  })

  await incrementScanCount(payload, qr.id)
}

/**
 * Bump the denormalised counter on the QR code.
 *
 * Deliberately raw SQL rather than payload.update(). Reading the count into
 * JavaScript, adding one, and writing it back loses increments whenever two
 * scans overlap, which was demonstrated in practice: two requests produced two
 * scan-events rows but a counter of 1. Two people scanning the same table tent
 * at once is the normal case, not the edge case, and this number is what an
 * advertiser sees at renewal.
 *
 * `scan_count = scan_count + 1` makes Postgres do the arithmetic under a row
 * lock, so concurrent scans cannot lose one.
 *
 * Schema and table names come from the adapter's own config, never from the
 * request, so interpolating them is safe. The id is parameterised.
 *
 * Everything here is caught. This counter is a convenience shown in the admin
 * list; scan-events is the authoritative record and has already been written by
 * the time we get here. A reader holding a printed code must always be
 * redirected, so no failure in this function is allowed to reach them - but it
 * does get logged loudly, because a counter that silently stops moving is the
 * failure that costs a renewal argument.
 */
async function incrementScanCount(
  payload: Awaited<ReturnType<typeof getPayload>>,
  qrId: number | string,
) {
  try {
    const db = rawDb(payload)

    await db.pool.query(
      `update "${db.schema}"."${db.table('qr_codes')}" set scan_count = scan_count + 1 where id = $1`,
      [qrId],
    )
  } catch (error) {
    await reportError(error, { source: 'qr.scan-counter', extra: { qrId } })
  }
}

function detectPlatform(userAgent: string): 'ios' | 'android' | 'web' | 'unknown' {
  if (!userAgent) return 'unknown'
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios'
  if (/android/i.test(userAgent)) return 'android'
  return 'web'
}
