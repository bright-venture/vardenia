import type { Payload } from 'payload'

/**
 * The one place that reaches into Payload's database adapter.
 *
 * Three things here are raw SQL rather than payload.update(). Two of them are
 * counters - the scan counter and the error counter - which have to increment
 * as `count = count + 1` in the database, because Payload's update takes a
 * value and there is no way to express "one more than whatever is there"
 * through the document API; reading the row first loses occurrences whenever
 * two arrive together. The third is the scan report, which is all aggregates
 * and Payload has no grouping.
 *
 * All three need the pool, the schema and the real table name, and none of
 * those are public API.
 *
 * They used to be read inline at each call site, like this:
 *
 *     const schema = db.schemaName ?? 'public'
 *
 * The cast was never the problem. That fallback was. Our tables live in the
 * `payload` schema deliberately, so Supabase's auto-generated REST API cannot
 * see them (see the schemaName note in payload.config.ts). If an upgrade renamed
 * `schemaName`, the expression above quietly resolves to `public` and the scan
 * counter starts writing somewhere else - succeeding, returning no error, and
 * leaving a number that stops moving for reasons nobody can see. On a product
 * where that number is the evidence behind a renewal conversation, a loud
 * failure is worth far more than a graceful one.
 *
 * So nothing here falls back. Every value is either what we expect or an
 * exception. Callers that must not fail - the QR redirect above all - catch and
 * carry on, which is a decision each of them makes explicitly rather than one
 * this module makes silently on their behalf.
 */

/**
 * The Postgres schema every Payload table lives in.
 *
 * Single source of truth: payload.config.ts passes this to the adapter, and
 * `rawDb` asserts the adapter still reports it. Change it in one place.
 */
export const DB_SCHEMA = 'payload'

interface QueryResult {
  rows: Record<string, unknown>[]
}

interface Pool {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>
}

/** The undocumented shape we depend on. If Payload moves, this stops matching. */
interface DrizzleInternals {
  pool?: Pool
  schemaName?: string
  tableNameMap?: Map<string, string>
}

export interface RawDb {
  pool: Pool
  /** Always quoted and safe to interpolate: it comes from our own constant. */
  schema: string
  /**
   * Resolve a table's real name from its default (snake_cased) name.
   *
   * Payload keys `tableNameMap` on the default name and stores whatever the
   * table ended up called, which differs only when a collection sets a custom
   * `dbName`. We set none today, so these are currently identical - which is
   * exactly why looking it up matters: the day someone adds one, every query
   * here follows automatically instead of silently addressing a table that no
   * longer exists.
   */
  table: (defaultName: string) => string
}

class DatabaseInternalsError extends Error {
  constructor(detail: string) {
    super(
      `Payload's database internals are not what this build expects: ${detail}. ` +
        `Raw SQL in src/lib/db.ts depends on them. This usually means a Payload ` +
        `upgrade changed the adapter - check @payloadcms/drizzle before deploying.`,
    )
    this.name = 'DatabaseInternalsError'
  }
}

/**
 * Get the pool, schema and table resolver, or throw.
 *
 * Cheap enough to call per query - it is property reads and one comparison.
 */
export function rawDb(payload: Payload): RawDb {
  const db = payload.db as unknown as DrizzleInternals

  if (!db.pool) {
    throw new DatabaseInternalsError('no connection pool on payload.db')
  }

  if (db.schemaName !== DB_SCHEMA) {
    throw new DatabaseInternalsError(
      `expected schema ${JSON.stringify(DB_SCHEMA)} but the adapter reports ` +
        `${JSON.stringify(db.schemaName)}`,
    )
  }

  const map = db.tableNameMap
  if (!(map instanceof Map)) {
    throw new DatabaseInternalsError('payload.db.tableNameMap is missing or not a Map')
  }

  return {
    pool: db.pool,
    schema: DB_SCHEMA,
    table: (defaultName: string) => {
      const resolved = map.get(defaultName)
      if (!resolved) {
        throw new DatabaseInternalsError(`no table registered under ${JSON.stringify(defaultName)}`)
      }
      return resolved
    },
  }
}

/**
 * Boot-time check, wired into the Payload config's `onInit`.
 *
 * Without it the first sign of trouble is a failed scan on a printed code,
 * possibly weeks after the deploy that caused it. With it, the process refuses
 * to come up. A build that will not start is a much better outcome than one that
 * runs and undercounts.
 *
 * Touches the tables the raw SQL actually names, so a renamed collection is
 * caught here too.
 */
export function assertDatabaseInternals(payload: Payload): void {
  const db = rawDb(payload)
  for (const table of ['qr_codes', 'scan_events', 'businesses', 'issues', 'error_events']) {
    db.table(table)
  }
}
