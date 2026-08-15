import { getPayload } from 'payload'
import config from '../payload.config'
import { rawDb } from './db'

/**
 * Turning the scan log into the numbers a renewal conversation runs on.
 *
 * Scans have been collected correctly since the QR layer was built and nothing
 * has ever read them. This is the read side: what an advertiser is shown, and
 * what the team analyses.
 *
 * Written as SQL rather than through Payload's query API because these are
 * aggregates - counts, distinct cities, a most-common value, a date range -
 * and Payload has no grouping. Fetching every row and reducing it in JavaScript
 * would work today with a handful of scans and stop working exactly when the
 * product succeeds.
 *
 * Everything that comes from a request is passed as a bound parameter. The only
 * interpolated values are the schema and table names, which are read from the
 * adapter's own configuration.
 */

export interface ReportRange {
  from: Date
  to: Date
}

export interface ListingScanRow {
  business: string | null
  code: string | null
  issueNumber: number | null
  issueTitle: string | null
  scans: number
  directScans: number
  sharedScans: number
  cities: number
  topCity: string | null
  ios: number
  android: number
  web: number
  firstScan: Date | null
  lastScan: Date | null
}

export interface ScanEventRow {
  scannedAt: Date
  code: string
  business: string | null
  placement: string | null
  city: string | null
  country: string | null
  platform: string | null
  isDirectScan: boolean
}

async function query(sql: string, values: unknown[]) {
  const payload = await getPayload({ config })
  const db = rawDb(payload)

  const result = await db.pool.query(sql.replaceAll('{schema}', `"${db.schema}"`), values)
  return result.rows
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0))
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)
const date = (v: unknown): Date | null => (v instanceof Date ? v : v ? new Date(String(v)) : null)

/**
 * One row per code, with the business it belongs to.
 *
 * Grouped by code rather than by business on purpose. Today a business has
 * exactly one code, so the two are identical - but the entire point of the
 * placement field is that a business will eventually have several, and a report
 * that silently merges them cannot answer the question it exists for: which
 * surface earned the scans.
 *
 * `mode()` gives the most common city without a second round trip.
 */
export async function listingScanReport({ from, to }: ReportRange): Promise<ListingScanRow[]> {
  const rows = await query(
    `
    select
      bl.name                                            as business,
      se.code                                            as code,
      i.issue_number                                     as issue_number,
      il.title                                           as issue_title,
      count(*)::int                                      as scans,
      count(*) filter (where se.is_direct_scan)::int     as direct_scans,
      count(*) filter (where not se.is_direct_scan)::int as shared_scans,
      count(distinct se.city)::int                       as cities,
      mode() within group (order by se.city)             as top_city,
      count(*) filter (where se.platform = 'ios')::int     as ios,
      count(*) filter (where se.platform = 'android')::int as android,
      count(*) filter (where se.platform = 'web')::int     as web,
      min(se.scanned_at)                                 as first_scan,
      max(se.scanned_at)                                 as last_scan
    from {schema}.scan_events se
      left join {schema}.qr_codes         q  on q.id  = se.qr_code_id
      left join {schema}.businesses       b  on b.id  = se.business_id
      left join {schema}.businesses_locales bl on bl._parent_id = b.id and bl._locale = 'en'
      left join {schema}.issues           i  on i.id  = q.issue_id
      left join {schema}.issues_locales   il on il._parent_id = i.id and il._locale = 'en'
    where se.scanned_at >= $1 and se.scanned_at < $2
    group by bl.name, se.code, i.issue_number, il.title
    order by scans desc, business asc
    `,
    [from, to],
  )

  return rows.map((r) => ({
    business: str(r.business),
    code: str(r.code),
    issueNumber: r.issue_number === null ? null : num(r.issue_number),
    issueTitle: str(r.issue_title),
    scans: num(r.scans),
    directScans: num(r.direct_scans),
    sharedScans: num(r.shared_scans),
    cities: num(r.cities),
    topCity: str(r.top_city),
    ios: num(r.ios),
    android: num(r.android),
    web: num(r.web),
    firstScan: date(r.first_scan),
    lastScan: date(r.last_scan),
  }))
}

/**
 * The raw log, for analysis rather than for sending to an advertiser.
 *
 * Capped, because an unbounded export of a table designed to grow without limit
 * is a way to take the database down from a browser tab.
 */
export async function scanEventExport(
  { from, to }: ReportRange,
  limit = 10_000,
): Promise<ScanEventRow[]> {
  const rows = await query(
    `
    select
      se.scanned_at, se.code, se.placement, se.city, se.country, se.platform,
      se.is_direct_scan, bl.name as business
    from {schema}.scan_events se
      left join {schema}.businesses       b  on b.id = se.business_id
      left join {schema}.businesses_locales bl on bl._parent_id = b.id and bl._locale = 'en'
    where se.scanned_at >= $1 and se.scanned_at < $2
    order by se.scanned_at desc
    limit $3
    `,
    [from, to, Math.min(50_000, Math.max(1, limit))],
  )

  return rows.map((r) => ({
    scannedAt: date(r.scanned_at) ?? new Date(0),
    code: String(r.code ?? ''),
    business: str(r.business),
    placement: str(r.placement),
    city: str(r.city),
    country: str(r.country),
    platform: str(r.platform),
    isDirectScan: r.is_direct_scan === true,
  }))
}

/**
 * Reads a date range off the query string.
 *
 * Defaults to the last 90 days, which is roughly a quarter - the period a
 * renewal conversation actually covers. `to` is exclusive and pushed to the end
 * of the given day, so `?to=2026-08-13` includes everything scanned on the 13th
 * rather than stopping at midnight and quietly losing a day.
 */
export function parseRange(params: URLSearchParams, now = new Date()): ReportRange {
  const parse = (value: string | null): Date | null => {
    if (!value) return null
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const to = parse(params.get('to'))
  const from = parse(params.get('from'))

  const end = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : now
  const start = from ?? new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000)

  // A reversed range would silently return nothing; swap rather than mislead.
  return start <= end ? { from: start, to: end } : { from: end, to: start }
}
