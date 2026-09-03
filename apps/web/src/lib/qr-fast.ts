import { Pool } from 'pg'
import { DB_SCHEMA } from './db'
import type { QrDoc } from './qr-doc'

/**
 * The scan path, with Payload taken out of it.
 *
 * # Why this exists
 *
 * `/g/CODE` is the whole product in one request: somebody is standing in a
 * restaurant holding up a phone. It was importing `payload.config` at the top of
 * the route, and that import alone was measured at **3245ms** on a cold Netlify
 * function - before a single query ran. `getPayload()` added 1181ms and the
 * first query 911ms, for about 5.3 seconds of doing nothing a reader can see.
 *
 * That is not a number from a profiler run in anger. The designer scanned a
 * printed code and waited five to six seconds, which is what prompted this.
 *
 * Warm, the same route answers in 0.3s. So the cost is paid by exactly the
 * person it must never be paid by: the first reader after a quiet spell, which
 * on a magazine that ships to a few thousand people is most of them.
 *
 * # What the redirect actually needs
 *
 * One row, joined to whichever of three tables the code points at, to build a
 * URL. It needs no rich-text editor, no image pipeline, no schema validation and
 * no access control - the route reads with access bypassed anyway, because
 * `qr-codes` is staff-only and the reader is anonymous.
 *
 * So this module talks to Postgres directly and imports nothing from Payload but
 * a type, which the compiler erases. The route keeps its cache, its guard and
 * its resolver; only the data access changed.
 *
 * # The table and column names are written out here
 *
 * `lib/db.ts` reads them off the adapter, and cannot be used for that here -
 * having the adapter means having imported the config, which is the entire cost
 * being removed. So they are literals, and that is a real trade: a Payload
 * upgrade that renamed a table would break this and not the rest of the app.
 *
 * `assertScanSchema` below is the answer to that. It is cheap, it runs once per
 * process, and it turns a rename into a loud error naming the missing column
 * rather than a redirect loop nobody notices for a week.
 */

/**
 * One pool per warm instance, created on first use.
 *
 * Small on purpose. A serverless instance serves a handful of concurrent
 * requests, and Supabase's transaction pooler is doing the real pooling in
 * front of the database - opening ten connections per instance would exhaust
 * that, not help. Two is enough to overlap a lookup with a scan write.
 *
 * Never closed. The instance is frozen between requests and thawed for the next
 * one, so a pool that survives is the point: it is what makes the second scan
 * cost nothing.
 */
let pool: Pool | null = null

function db(): Pool {
  if (pool) return pool

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set.')

  pool = new Pool({
    connectionString,
    max: 2,
    // Supabase terminates TLS with a certificate chain Node does not ship. The
    // connection is still encrypted; this only skips verifying the issuer, and
    // it is what the Payload adapter does against the same host.
    ssl: { rejectUnauthorized: false },
    // A reader is waiting. Failing fast and sending them to the "we could not
    // find this" page beats holding the request open for thirty seconds.
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
  })

  return pool
}

/** Rows come back with snake_case columns; only these are read. */
interface CodeRow {
  id: number
  code: string
  active: boolean | null
  target_type: string | null
  category: string | null
  external_url: string | null
  placement: string | null
  business_id: number | null
  business_slug: string | null
  business_status: string | null
  article_id: number | null
  article_slug: string | null
  article_status: string | null
  issue_id: number | null
  issue_slug: string | null
}

/**
 * One query, three left joins, and deliberately no `select *`.
 *
 * The joins are what replace `depth: 1`. `resolveDestination` needs the target's
 * slug and, for the two collections that have drafts, its `_status` - because a
 * listing unpublished after the magazine shipped has to land on "this has moved"
 * rather than on a 404. Slugs are not localised (see fields/slug), so there is
 * no locale table to join.
 */
const LOOKUP = `
  select
    q.id, q.code, q.active, q.target_type, q.category, q.external_url, q.placement,
    b.id as business_id, b.slug as business_slug, b._status as business_status,
    a.id as article_id, a.slug as article_slug, a._status as article_status,
    i.id as issue_id, i.slug as issue_slug
  from "${DB_SCHEMA}"."qr_codes" q
  left join "${DB_SCHEMA}"."businesses" b on b.id = q.business_id
  left join "${DB_SCHEMA}"."articles"   a on a.id = q.article_id
  left join "${DB_SCHEMA}"."issues"     i on i.id = q.issue_id
  where q.code = $1
  limit 1
`

/**
 * A code's destination data, or null when there is no such code.
 *
 * Returns the same `QrDoc` shape the Payload lookup did, so `resolveDestination`
 * and the scan writer did not have to change. The relationships are handed back
 * populated, which is what `populated()` at the other end expects.
 */
export async function lookupCode(code: string): Promise<QrDoc | null> {
  const result = await db().query<CodeRow>(LOOKUP, [code])
  const row = result.rows[0]
  if (!row) return null

  return {
    id: row.id,
    code: row.code,
    active: row.active,
    targetType: row.target_type,
    category: row.category,
    externalUrl: row.external_url,
    placement: row.placement as QrDoc['placement'],
    business: row.business_id
      ? {
          id: row.business_id,
          slug: row.business_slug,
          _status: row.business_status as 'draft' | 'published' | null,
        }
      : null,
    article: row.article_id
      ? {
          id: row.article_id,
          slug: row.article_slug,
          _status: row.article_status as 'draft' | 'published' | null,
        }
      : null,
    issue: row.issue_id ? { id: row.issue_id, slug: row.issue_slug } : null,
  }
}

export interface ScanRecord {
  code: string
  qrCodeId: number
  businessId: number | null
  placement: string | null
  city: string | null
  country: string | null
  platform: 'ios' | 'android' | 'web' | 'unknown'
  isDirectScan: boolean
}

/**
 * The scan log row and the counter, in one round trip.
 *
 * A CTE rather than two statements because this runs in `after()`, which holds
 * the function alive after the response has gone - so its cost is billed even
 * though nobody is waiting for it.
 *
 * The counter is `scan_count + 1` in the database for the reason
 * `incrementScanCount` gave when it lived in the route: reading the value into
 * JavaScript and writing it back loses increments when two people scan the same
 * table card at once, which was demonstrated rather than assumed.
 *
 * `::text::enum` on the two enum columns. The driver sends a parameter as an
 * unknown type and Postgres usually infers it from context, but "usually" is not
 * a property to rely on inside an INSERT that only ever runs in production.
 */
const RECORD = `
  with logged as (
    insert into "${DB_SCHEMA}"."scan_events"
      (code, qr_code_id, business_id, scanned_at, placement, city, country, platform, is_direct_scan)
    values (
      $1, $2, $3, now(),
      $4::text::"${DB_SCHEMA}"."enum_scan_events_placement",
      $5, $6,
      $7::text::"${DB_SCHEMA}"."enum_scan_events_platform",
      $8
    )
  )
  update "${DB_SCHEMA}"."qr_codes" set scan_count = scan_count + 1 where id = $2
`

export async function recordScan(scan: ScanRecord): Promise<void> {
  await db().query(RECORD, [
    scan.code,
    scan.qrCodeId,
    scan.businessId,
    scan.placement,
    scan.city,
    scan.country,
    scan.platform,
    scan.isDirectScan,
  ])
}

/**
 * Proves the names above still exist, once per process.
 *
 * The names are literals because the adapter that knows them is the thing this
 * module exists to avoid loading. That trade is only acceptable with something
 * watching it, and this is that: one catalogue query, run the first time a scan
 * is written, which fails loudly and by name.
 *
 * Deliberately on the write path and not the read path. A rename should not stop
 * a reader reaching a restaurant - the redirect is the promise on the paper -
 * and the write already runs after the response has gone, where an error costs
 * the analytics row it was going to write and nothing else.
 */
let verified: Promise<void> | null = null

const REQUIRED: Record<string, string[]> = {
  qr_codes: ['id', 'code', 'active', 'target_type', 'category', 'external_url', 'scan_count'],
  scan_events: ['code', 'qr_code_id', 'business_id', 'scanned_at', 'placement', 'platform'],
  businesses: ['id', 'slug', '_status'],
  articles: ['id', 'slug', '_status'],
  issues: ['id', 'slug'],
}

export function assertScanSchema(): Promise<void> {
  verified ??= (async () => {
    const { rows } = await db().query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = $1 and table_name = any($2)`,
      [DB_SCHEMA, Object.keys(REQUIRED)],
    )

    const seen = new Set(
      rows.map(
        (row: { table_name: string; column_name: string }) =>
          `${row.table_name}.${row.column_name}`,
      ),
    )
    const missing = Object.entries(REQUIRED).flatMap(([table, columns]) =>
      columns.filter((column) => !seen.has(`${table}.${column}`)).map((c) => `${table}.${c}`),
    )

    if (missing.length > 0) {
      // Reset so a later request tries again rather than caching the failure
      // forever on an instance that may outlive a migration.
      verified = null
      throw new Error(
        `The scan path reads columns that no longer exist: ${missing.join(', ')}. ` +
          'lib/qr-fast.ts writes these names out rather than reading them off the ' +
          'Payload adapter, so a rename has to be applied here by hand.',
      )
    }
  })()

  return verified
}
