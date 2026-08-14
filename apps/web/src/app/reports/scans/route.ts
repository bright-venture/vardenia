import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '../../../payload.config'
import { toCsv, UTF8_BOM, type CsvValue } from '../../../lib/csv'
import { listingScanReport, parseRange, scanEventExport } from '../../../lib/scan-report'

/**
 * The scan report, as a spreadsheet.
 *
 *   /reports/scans                          last 90 days, one row per code
 *   /reports/scans?from=2026-01-01&to=2026-03-31
 *   /reports/scans?format=events            the raw log instead
 *
 * A CSV rather than a screen, deliberately. What this data is *for* is a renewal
 * conversation, and what that needs is a file somebody can attach to an email or
 * open next to a rate card. A dashboard would look better and be used less.
 *
 * Staff only. These are commercial figures: how well a competitor's placement
 * performed is not something an advertiser should be able to read, and the raw
 * export carries city-level data about readers.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config })

  const { user } = await payload.auth({ headers: request.headers })
  const roles = ((user as { roles?: string[] } | null)?.roles ?? []) as string[]
  if (!roles.some((role) => role === 'admin' || role === 'staff')) {
    return new Response('Staff only. Sign in to the admin panel first.', { status: 403 })
  }

  const url = new URL(request.url)
  const range = parseRange(url.searchParams)
  const events = url.searchParams.get('format') === 'events'

  const { headers, rows, name } = events
    ? await buildEventExport(range)
    : await buildListingReport(range)

  const stamp = `${range.from.toISOString().slice(0, 10)}_to_${new Date(range.to.getTime() - 1).toISOString().slice(0, 10)}`

  return new Response(UTF8_BOM + toCsv(headers, rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="vardenia-${name}-${stamp}.csv"`,
      // Commercial figures that change as scans arrive. Never cached.
      'cache-control': 'no-store',
    },
  })
}

async function buildListingReport(range: Parameters<typeof listingScanReport>[0]) {
  const report = await listingScanReport(range)

  return {
    name: 'scans',
    headers: [
      'Business',
      'Code',
      'Issue',
      'Issue title',
      'Total scans',
      'Scanned from print',
      'Opened from a shared link',
      'Cities reached',
      'Top city',
      'iPhone',
      'Android',
      'Other',
      'First scan',
      'Last scan',
    ],
    rows: report.map((r): CsvValue[] => [
      r.business,
      r.code,
      r.issueNumber,
      r.issueTitle,
      r.scans,
      r.directScans,
      r.sharedScans,
      r.cities,
      r.topCity,
      r.ios,
      r.android,
      r.web,
      r.firstScan,
      r.lastScan,
    ]),
  }
}

async function buildEventExport(range: Parameters<typeof scanEventExport>[0]) {
  const events = await scanEventExport(range)

  return {
    name: 'scan-events',
    headers: [
      'Scanned at',
      'Code',
      'Business',
      'Placement',
      'City',
      'Country',
      'Platform',
      'Scanned from print',
    ],
    rows: events.map((e): CsvValue[] => [
      e.scannedAt,
      e.code,
      e.business,
      e.placement,
      e.city,
      e.country,
      e.platform,
      e.isDirectScan,
    ]),
  }
}
