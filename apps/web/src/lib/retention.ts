import type { Payload, Where } from 'payload'

/**
 * Deleting what the privacy policy says is only kept for a while.
 *
 * Runs hourly through POST /booking/retention (netlify/functions/
 * apply-retention.mts): printed-code scans after 12 months, error records after
 * 90 days, and a receipt whose booking no longer exists after 12 months.
 *
 * # Bookings are not touched (20 November 2026)
 *
 * Until then a booking was deleted, or cut down to its passport stamp, 12
 * months after the visit. The owner decided to keep every booking for good as
 * the business record (reference, place, dates, party size, status, rooms,
 * amounts). What is personal in a booking goes when the account closes instead
 * (lib/account-deletion: notes, receipts and their photos, the person's name,
 * contact details and sign-in), so a closed account's bookings are anonymous
 * records, and an open account's bookings stay whole for as long as the person
 * keeps the account. The privacy policy (lib/legal) says the same.
 */

export const RETENTION = {
  scanMonths: 12,
  errorDays: 90,
  /** A receipt left without a booking (a booking deleted by staff). */
  orphanReceiptMonths: 12,
} as const

/**
 * Marks a delete made by this job or by closing an account, so the receipt
 * hooks do not re-read the booking (hooks/stampReceiptAmount): that would
 * recompute its billing from no receipt and email the team about a "new"
 * disagreement.
 */
export const RETENTION_CONTEXT = 'retention'

/** `months` calendar months before `now`. */
export function monthsBefore(now: Date, months: number): Date {
  const date = new Date(now)
  date.setUTCMonth(date.getUTCMonth() - months)
  return date
}

/** `days` days before `now`. */
export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

export interface RetentionResult {
  receipts: number
  scans: number
  errors: number
  failed: number
  dryRun: boolean
}

export async function applyRetention(
  payload: Payload,
  { now = new Date(), dryRun = false } = {},
): Promise<RetentionResult> {
  const result: RetentionResult = { receipts: 0, scans: 0, errors: 0, failed: 0, dryRun }

  try {
    result.receipts = await deleteReceipts(
      payload,
      {
        and: [
          { booking: { exists: false } },
          {
            createdAt: {
              less_than: monthsBefore(now, RETENTION.orphanReceiptMonths).toISOString(),
            },
          },
        ],
      },
      dryRun,
    )
  } catch (error) {
    result.failed += 1
    payload.logger.error({ err: error }, 'retention: orphan receipts not cleared')
  }

  result.scans = await deleteOlderThan(
    payload,
    'scan-events',
    { scannedAt: { less_than: monthsBefore(now, RETENTION.scanMonths).toISOString() } },
    dryRun,
  )
  result.errors = await deleteOlderThan(
    payload,
    'error-events',
    { lastSeen: { less_than: daysBefore(now, RETENTION.errorDays).toISOString() } },
    dryRun,
  )

  return result
}

/** Deletes the matching receipts through Payload, so their photos go too. */
async function deleteReceipts(payload: Payload, where: Where, dryRun: boolean): Promise<number> {
  const found = await payload.find({
    collection: 'receipts',
    where,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: {},
  })
  if (dryRun) return found.docs.length

  let deleted = 0
  for (const receipt of found.docs) {
    await payload.delete({
      collection: 'receipts',
      id: receipt.id,
      overrideAccess: true,
      context: { [RETENTION_CONTEXT]: true },
    })
    deleted += 1
  }
  return deleted
}

/** Deletes rows with no hooks and no files in one statement, returning how many. */
async function deleteOlderThan(
  payload: Payload,
  collection: 'scan-events' | 'error-events',
  where: Where,
  dryRun: boolean,
): Promise<number> {
  const { totalDocs } = await payload.count({ collection, where, overrideAccess: true })
  if (totalDocs > 0 && !dryRun) await payload.db.deleteMany({ collection, where })
  return totalDocs
}
