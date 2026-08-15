import { after } from 'next/server'
import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import { normalizeCode } from '@vardenia/core'
import config from '../../../payload.config'
import { clientIp, evaluateScan } from '../../../lib/scan-guard'
import { isPubliclyVisible, populated, relatedId, type QrDoc } from '../../../lib/qr-doc'
import { normalizeExternalUrl } from '../../../lib/external-url'
import { rawDb } from '../../../lib/db'

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params
  const code = normalizeCode(rawCode)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin

  if (!code) {
    return Response.redirect(`${siteUrl}/scan/not-found`, 302)
  }

  const payload = await getPayload({ config })

  const result = await payload.find({
    collection: 'qr-codes',
    where: { code: { equals: code } },
    limit: 1,
    depth: 1,
  })

  const qr = result.docs[0]
  if (!qr) {
    return Response.redirect(`${siteUrl}/scan/not-found?code=${code}`, 302)
  }
  if (!qr.active) {
    return Response.redirect(`${siteUrl}/scan/moved?code=${code}`, 302)
  }

  const destination = resolveDestination(qr, siteUrl)

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
      payload.logger.error({ error, code }, 'Failed to record scan event')
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
  } catch {
    payload.logger.error({ code, destination }, 'Unusable redirect destination for printed code')
    return Response.redirect(`${siteUrl}/scan/not-found?code=${code}`, 302)
  }
}

/**
 * Where an unpublished target sends the reader.
 *
 * "Moved" rather than "not found", because that is what happened: the listing
 * existed when the magazine went to print and does not now. The page offers a
 * way onward instead of a dead end.
 */
const movedTo = (siteUrl: string, qr: QrDoc) =>
  `${siteUrl}/scan/moved?code=${encodeURIComponent(qr.code ?? '')}`

function resolveDestination(qr: QrDoc, siteUrl: string): string {
  switch (qr.targetType) {
    /**
     * Published targets only.
     *
     * This lookup runs with access control bypassed - it has to, because
     * qr-codes is staff-only and the reader is anonymous - so it sees drafts
     * that the destination page will refuse to render. Without the check, a
     * listing unpublished after the magazine shipped sent every scan of a
     * printed code to a 404.
     *
     * That was not hypothetical: the `active` checkbox on a code exists to send
     * retired codes to /scan/moved, but unpublishing the *listing* is a
     * different screen and skipped the safety net entirely. Unpublishing is the
     * common action; remembering to also retire the code is not.
     */
    case 'business': {
      const doc = populated(qr.business)
      if (!doc?.slug) return `${siteUrl}/scan/not-found`
      if (!isPubliclyVisible(doc)) return movedTo(siteUrl, qr)
      return `${siteUrl}/directory/${doc.slug}`
    }
    case 'article': {
      const doc = populated(qr.article)
      if (!doc?.slug) return `${siteUrl}/scan/not-found`
      if (!isPubliclyVisible(doc)) return movedTo(siteUrl, qr)
      return `${siteUrl}/magazine/articles/${doc.slug}`
    }
    case 'issue': {
      // Issues have no draft state, so there is nothing to check here.
      const slug = populated(qr.issue)?.slug
      return slug ? `${siteUrl}/magazine/issues/${slug}` : `${siteUrl}/magazine`
    }
    case 'category': {
      // The directory already filters on this, so a printed "scan for every
      // hotel in Lebanon" code needs no new page.
      const slug = typeof qr.category === 'string' ? qr.category : null
      return slug
        ? `${siteUrl}/directory?category=${encodeURIComponent(slug)}`
        : `${siteUrl}/directory`
    }
    case 'external': {
      // Normalised again rather than trusted: validation covers everything saved
      // from now on, but codes created before it existed, or written through the
      // API, can still hold a bare domain that would throw below.
      const external = normalizeExternalUrl(qr.externalUrl)
      return external ?? `${siteUrl}/scan/not-found`
    }
    default:
      // A target type with no case here used to land on the homepage, which
      // tells the reader nothing and looks like the code worked. The
      // "we couldn't find this" page at least explains itself and offers a way
      // onward. Reaching this means QR_TARGET_TYPES grew without the resolver
      // growing with it.
      return `${siteUrl}/scan/not-found?code=${qr.code ?? ''}`
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
      // Geo headers are populated by the CDN (Vercel / Cloudflare). City-level only.
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
    payload.logger.error({ err: error, qrId }, 'Scan counter not incremented')
  }
}

function detectPlatform(userAgent: string): 'ios' | 'android' | 'web' | 'unknown' {
  if (!userAgent) return 'unknown'
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios'
  if (/android/i.test(userAgent)) return 'android'
  return 'web'
}
