import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { rawDb } from './db'

/**
 * The rate-limit counter, in the one place every instance can see.
 *
 * # One statement, and why it has to be
 *
 * Read the row, add one, write it back is the same lost-update bug the scan
 * counter and the error counter both had, except here losing an update means
 * letting an attempt through that should have been refused. Two requests
 * arriving together would both read 9, both write 10, and a budget of 10 would
 * have allowed eleven.
 *
 * So the whole thing is a single INSERT ... ON CONFLICT DO UPDATE, and the
 * window roll happens inside it: if the stored window has already expired the
 * count resets to 1 rather than incrementing, decided by Postgres against the
 * row it is holding a lock on. There is no moment between deciding and writing.
 *
 * # The key is hashed
 *
 * A bucket is a budget and a caller, and the caller is an IP address. Storing
 * those in the clear would turn a counter table into a log of who visited,
 * which is a thing the privacy policy would then have to describe. The hash is
 * one-way and the table is closed to every API, so it stays a counter.
 */

interface Hit {
  count: number
  resetAt: number
}

/** Never an address in the clear. See the note above. */
export function bucketKey(budget: number, ip: string): string {
  return createHash('sha256').update(`${budget}:${ip}`).digest('hex').slice(0, 32)
}

/**
 * Count one attempt and report where the window now stands.
 *
 * Returns null when the database cannot answer, which the caller treats as a
 * reason to fall back rather than as a refusal - see the note in rate-limit.ts
 * about failing open.
 */
export async function hit(
  payload: Payload,
  key: string,
  windowMs: number,
  now = Date.now(),
): Promise<Hit | null> {
  try {
    const db = rawDb(payload)
    const table = `"${db.schema}"."${db.table('rate_limits')}"`
    const resetAt = new Date(now + windowMs).toISOString()

    const result = await db.pool.query(
      `insert into ${table} ("key", "count", "reset_at")
            values ($1, 1, $2)
       on conflict ("key") do update
              set "count" = case
                              when ${table}."reset_at" <= $3 then 1
                              else ${table}."count" + 1
                            end,
                  "reset_at" = case
                              when ${table}."reset_at" <= $3 then $2
                              else ${table}."reset_at"
                            end
        returning "count", "reset_at"`,
      [key, resetAt, new Date(now).toISOString()],
    )

    const row = result.rows[0] as { count: number | string; reset_at: string | Date } | undefined
    if (!row) return null

    return {
      count: Number(row.count),
      resetAt: new Date(row.reset_at).getTime(),
    }
  } catch (error) {
    /**
     * Not reported through reportError, which writes to the database - the case
     * this catches is the database not answering, so the report would fail the
     * same way for every attempt.
     *
     * Announced once per process instead. The caller falls back to the
     * in-memory counter, which is the old, weak behaviour, and a degradation
     * nobody can see is barely better than no limit at all. The most likely
     * cause is a deploy that reached production before its migration did, so
     * the message says which table to look for.
     */
    warnOnce(error)
    return null
  }
}

let warned = false
function warnOnce(error: unknown): void {
  if (warned) return
  warned = true
  console.error(
    '[warn] rate-limit.store-unavailable: the shared counter could not be reached, ' +
      'so auth rate limiting has fallen back to per-instance counting. ' +
      'If this follows a deploy, check that the rate_limits table exists. ' +
      String(error).slice(0, 200),
  )
}

/**
 * Drop windows that ended a while ago.
 *
 * The table would otherwise grow one row per address for ever. Called
 * opportunistically rather than on a schedule, because there is no scheduler
 * here and a row that outlives its window is harmless until there are millions
 * of them.
 */
export async function sweepExpired(
  payload: Payload,
  olderThanMs = 60 * 60 * 1000,
  now = Date.now(),
): Promise<number> {
  try {
    const db = rawDb(payload)
    const table = `"${db.schema}"."${db.table('rate_limits')}"`
    const result = await db.pool.query(`delete from ${table} where "reset_at" < $1`, [
      new Date(now - olderThanMs).toISOString(),
    ])
    return result.rowCount ?? 0
  } catch {
    return 0
  }
}
