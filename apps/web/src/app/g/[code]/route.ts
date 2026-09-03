import { unstable_cache } from 'next/cache'
import { after } from 'next/server'
import type { NextRequest } from 'next/server'
import { normalizeCode } from '@vardenia/core'
import { clientIp, evaluateScan } from '../../../lib/scan-guard'
import { relatedId, type QrDoc } from '../../../lib/qr-doc'
import { markScanArrival, resolveDestination } from '../../../lib/qr-destination'
import { assertScanSchema, lookupCode, recordScan } from '../../../lib/qr-fast'
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
 *
 * # Nothing here imports Payload, and that is the point
 *
 * This route used to open with `import config from '../../../payload.config'`,
 * which cost a measured 3245ms on a cold function before any work began -
 * `getPayload()` another 1181ms, the first query 911ms. About 5.3 seconds spent
 * loading a rich-text editor and an image pipeline to turn seven characters into
 * a URL. It was not theoretical: the designer scanned a printed code and waited
 * five to six seconds.
 *
 * Warm, it answers in 0.3s. So the whole cost landed on the first reader after a
 * quiet spell, which for a magazine is most readers.
 *
 * `lib/qr-fast` does the lookup and the scan write over a plain connection. Keep
 * it that way: a single `import` of anything that reaches payload.config puts
 * all five seconds back, silently, and the only place it shows up is somebody
 * standing in a restaurant.
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

function lookup(code: string) {
  const run = async () => {
    // `null` rather than undefined: undefined is not JSON, and the cache stores
    // JSON. A miss has to be cacheable too, or a wrong code is the one request
    // shape that always hits the database.
    return (await lookupCode(code)) ?? null
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

  const qr = await lookup(code)
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
      // `console` rather than `payload.logger`: the logger belongs to an
      // instance this route no longer creates, and creating one to write a debug
      // line would reintroduce the five seconds. Netlify captures stdout.
      console.debug(`[scan] not counted: ${code} (${verdict.reason})`)
      return
    }
    try {
      // Checks the hand-written table and column names still exist. Once per
      // process, on the write path rather than the read path, so a rename costs
      // an analytics row and never a reader's redirect. See lib/qr-fast.
      await assertScanSchema()
      await logScan(qr, request)
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

/**
 * The scan log row, written without Payload.
 *
 * `scan-events` has no hooks and its `create` access is `() => false` - the rule
 * existed so nothing but this route could write one, and it was already bypassed
 * here with `overrideAccess`. So the document API was contributing validation of
 * a shape this function builds itself, at the price of the import this route no
 * longer makes. See lib/qr-fast for what replaced it, including the schema check
 * that guards the hand-written column names.
 */
async function logScan(qr: QrDoc, request: NextRequest) {
  const userAgent = request.headers.get('user-agent') ?? ''

  await recordScan({
    code: qr.code,
    qrCodeId: qr.id,
    businessId: relatedId(qr.business),
    placement: qr.placement ?? null,
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
  })
}

/**
 * The counter moved into the same statement as the log row.
 *
 * It used to be a second call here, wrapped in its own try/catch so a failed
 * counter could not lose the scan event that had already been written. Now both
 * are one CTE in `recordScan`, so either both land or neither does - which is
 * the better of the two, because a scan-events row with no matching increment
 * was the shape that made the counter and the log disagree.
 *
 * The arithmetic is still `scan_count = scan_count + 1` in the database, for the
 * reason it always was: reading the value into JavaScript and writing it back
 * loses increments when two people scan the same table card at once, which was
 * demonstrated rather than assumed - two requests, two rows, a counter of 1.
 */

function detectPlatform(userAgent: string): 'ios' | 'android' | 'web' | 'unknown' {
  if (!userAgent) return 'unknown'
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios'
  if (/android/i.test(userAgent)) return 'android'
  return 'web'
}
