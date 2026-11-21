import { sql } from '@payloadcms/db-postgres'
import { APIError, type PayloadRequest } from 'payload'
import { transactionDb } from './transaction-db'

/**
 * Serialises one partner's uploads, so the hourly cap in
 * hooks/guardPartnerUpload is a cap and not a count that parallel requests all
 * pass at once.
 *
 * A transaction-scoped advisory lock keyed by the partner id, taken on the
 * connection of the create's own transaction (Payload opens one before
 * `beforeOperation` runs). It is held until that create commits or rolls back,
 * so the next upload from the same partner counts after the previous row is
 * in. Other partners are not affected. Outside a transaction (no adapter
 * session) it falls back to the pool and protects only its own statement -
 * the same documented fallback as lib/transaction-db.
 *
 * # A bounded wait
 *
 * The lock is held for the whole create, file storage included. In Payload
 * 3.90 the image is resized before the collection's hooks, a local-disk file
 * is written just before the insert, and the S3 adapter uploads in its own
 * afterChange hook after the insert - all inside the one transaction, and a
 * transaction lock is only released at commit. A session-level lock unlocked
 * in an earlier afterChange hook would shrink the window to count + insert,
 * but any failure between lock and unlock would leave it held on a pooled
 * connection for good, which is worse than the problem. So the wait is what
 * is bounded: a queued upload waits at most
 * UPLOAD_LOCK_TIMEOUT_MS (`SET LOCAL lock_timeout`, this transaction only),
 * then gives up with a readable 429 and its connection goes back to the pool.
 * A waiting request therefore holds its pooled connection for at most a few
 * seconds, so a burst from one partner drains instead of piling up (the REST
 * route's per-address rate limit bounds how fast a burst can arrive). The
 * dashboard should upload one file at a time.
 */

export const UPLOAD_LOCK_TIMEOUT_MS = 4_000

/** Postgres lock_not_available, possibly wrapped by the driver. */
const isLockTimeout = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code
  if (code === '55P03') return true
  const cause = (error as { cause?: unknown } | null)?.cause
  return (cause as { code?: unknown } | null)?.code === '55P03'
}

export async function lockPartnerUploads(
  req: PayloadRequest,
  partnerId: string | number,
): Promise<void> {
  const db = await transactionDb(req)
  if (!db) return
  const key = `vardenia.partner-upload:${String(partnerId)}`
  await db.execute(sql.raw(`SET LOCAL lock_timeout = '${UPLOAD_LOCK_TIMEOUT_MS}ms'`))
  try {
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`)
  } catch (error) {
    if (isLockTimeout(error)) {
      throw new APIError(
        'Too many uploads in progress. Wait for the others to finish, then try again.',
        429,
        null,
        true,
      )
    }
    throw error
  }
  // Back to the session's own setting for the rest of the save.
  await db.execute(sql.raw('SET LOCAL lock_timeout TO DEFAULT'))
}
