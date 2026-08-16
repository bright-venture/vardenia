import type { Payload } from 'payload'
import { rawDb } from './db'

/**
 * The headline counts on the admin dashboard, in one query.
 *
 * They started as six separate `payload.count()` calls. Run in parallel that is
 * one round trip in wall-clock terms, which read as fine - but it also holds six
 * of the pool's ten connections for the duration, and the three "needs
 * attention" lookups take three more. Two staff opening the dashboard at the
 * same moment could leave nothing for the public site, which shares the pool.
 *
 * Counting is the part that collapses cleanly: six scalar subqueries cost one
 * connection and one round trip to Frankfurt instead of six of each.
 *
 * Raw SQL, so access control does not apply here the way it does to a Payload
 * query. That is acceptable for exactly this data and no more: these are counts
 * of rows, not the rows themselves, and the caller already refuses to render
 * anything without a signed-in staff user. The lists that carry real content -
 * names, contract dates - stay on Payload queries with `overrideAccess: false`
 * so field rules still decide what a given user may read.
 */

export interface DashboardCounts {
  publishedListings: number
  draftListings: number
  publishedArticles: number
  issues: number
  activeCodes: number
  recentScans: number
}

const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0))

export async function dashboardCounts(payload: Payload, since: Date): Promise<DashboardCounts> {
  const db = rawDb(payload)

  const businesses = `"${db.schema}"."${db.table('businesses')}"`
  const articles = `"${db.schema}"."${db.table('articles')}"`
  const issues = `"${db.schema}"."${db.table('issues')}"`
  const codes = `"${db.schema}"."${db.table('qr_codes')}"`
  const scans = `"${db.schema}"."${db.table('scan_events')}"`

  // Table and schema names come from the adapter's own configuration, never
  // from a request. The only request-shaped value is the date, which is bound.
  const result = await db.pool.query(
    `select
       (select count(*) from ${businesses} where _status = 'published')::int as published_listings,
       (select count(*) from ${businesses} where _status = 'draft')::int     as draft_listings,
       (select count(*) from ${articles}   where _status = 'published')::int as published_articles,
       (select count(*) from ${issues})::int                                 as issues,
       (select count(*) from ${codes}      where active)::int                as active_codes,
       (select count(*) from ${scans}      where scanned_at >= $1)::int      as recent_scans`,
    [since],
  )

  const row = result.rows[0] ?? {}

  return {
    publishedListings: num(row.published_listings),
    draftListings: num(row.draft_listings),
    publishedArticles: num(row.published_articles),
    issues: num(row.issues),
    activeCodes: num(row.active_codes),
    recentScans: num(row.recent_scans),
  }
}
