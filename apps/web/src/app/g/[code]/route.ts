import { after } from 'next/server'
import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import { normalizeCode } from '@vardenia/core'
import config from '../../../payload.config'
import { clientIp, evaluateScan } from '../../../lib/scan-guard'

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
  return Response.redirect(destination, 302)
}

function resolveDestination(qr: Record<string, any>, siteUrl: string): string {
  switch (qr.targetType) {
    case 'business': {
      const slug = typeof qr.business === 'object' ? qr.business?.slug : null
      return slug ? `${siteUrl}/directory/${slug}` : `${siteUrl}/scan/not-found`
    }
    case 'article': {
      const slug = typeof qr.article === 'object' ? qr.article?.slug : null
      return slug ? `${siteUrl}/magazine/articles/${slug}` : `${siteUrl}/scan/not-found`
    }
    case 'issue': {
      const slug = typeof qr.issue === 'object' ? qr.issue?.slug : null
      return slug ? `${siteUrl}/magazine/issues/${slug}` : `${siteUrl}/magazine`
    }
    case 'external':
      return typeof qr.externalUrl === 'string' ? qr.externalUrl : `${siteUrl}/scan/not-found`
    default:
      return siteUrl
  }
}

async function recordScan(
  payload: Awaited<ReturnType<typeof getPayload>>,
  qr: Record<string, any>,
  request: NextRequest,
) {
  const userAgent = request.headers.get('user-agent') ?? ''
  const businessId = typeof qr.business === 'object' ? qr.business?.id : qr.business

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
 */
async function incrementScanCount(
  payload: Awaited<ReturnType<typeof getPayload>>,
  qrId: number | string,
) {
  const db = payload.db as unknown as {
    pool?: { query: (text: string, values: unknown[]) => Promise<unknown> }
    schemaName?: string
    tableNameMap?: Map<string, string>
  }

  if (!db.pool) {
    // Never fail a scan over a display counter. scan-events remains authoritative.
    payload.logger.error({ qrId }, 'No database pool available; scan counter not incremented')
    return
  }

  const schema = db.schemaName ?? 'public'
  const table = db.tableNameMap?.get('qr_codes') ?? 'qr_codes'

  await db.pool.query(
    `update "${schema}"."${table}" set scan_count = scan_count + 1 where id = $1`,
    [qrId],
  )
}

function detectPlatform(userAgent: string): 'ios' | 'android' | 'web' | 'unknown' {
  if (!userAgent) return 'unknown'
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios'
  if (/android/i.test(userAgent)) return 'android'
  return 'web'
}
