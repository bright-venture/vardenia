import { sql } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'
import { transactionDb } from './transaction-db'

/**
 * The lock on one partner account's list of listings (Task 9).
 *
 * Taken by lib/branches before it reads and appends to a partner's
 * `businesses`, and by hooks/linkPartnerOnPublish before it does the same on
 * a publish, so the two read-modify-writes queue instead of one overwriting
 * the other. Staff editing the list in the admin do not take it; the branch
 * endpoint re-reads the list right before its write to narrow that window.
 */
export const partnerLockKey = (partnerId: number | string) =>
  `vardenia.branches.partner:${String(partnerId)}`

/**
 * pg_advisory_xact_lock on the transaction's own connection
 * (lib/transaction-db), held until that transaction ends. Outside a
 * transaction it falls back to the pool and protects only its own statement;
 * with no database in reach it does nothing.
 */
export async function advisoryLock(req: PayloadRequest, key: string): Promise<void> {
  const db = await transactionDb(req)
  if (!db) return
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`)
}

/**
 * The lock on one Magazine Places submission (finish and the abandon job).
 * Both take it in their own transaction, then re-read the business status and
 * the upload session before writing, so a finish and an abandon (or two
 * finishes) queue instead of one overwriting the other.
 */
export const placeSubmissionLockKey = (businessId: number | string) =>
  `vardenia.place-submission:${String(businessId)}`
