import type { Payload, Where } from 'payload'

/**
 * Hides a listing from the website once its contract has ended.
 *
 * "Contract ends" is a date, stored as midnight Beirut time at the start of
 * that day (15 January is 2027-01-14T22:00Z), and the contract covers the
 * whole of it. So a listing is lapsed once a full day has passed since that
 * midnight: a contract ending 15 January is still shown on the 15th and hidden
 * from the morning of the 16th, when the daily job runs.
 *
 * Hiding is setting Status back to Draft, the same switch the team uses by
 * hand. That is what keeps everything else as it was: every page, search, QR
 * code and booking form already ignores a draft, the business still sees its
 * own listing in the partner area (its read rule includes what it owns), and
 * the save runs hooks/revalidateListings, which clears the cached pages, so the
 * listing disappears that morning rather than when a cached copy runs out.
 *
 * To renew, the team moves the date forward and sets Status to Published. A
 * listing published again with an ended date is hidden again the next morning.
 *
 * Called once a day from POST /booking/retention (netlify/functions/
 * apply-retention).
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Before this instant, a contract has ended. */
export function lapseCutoff(now: Date): Date {
  return new Date(now.getTime() - DAY_MS)
}

export function lapsedListingsWhere(now: Date): Where {
  return {
    and: [
      { _status: { equals: 'published' } },
      { contractEndsAt: { less_than: lapseCutoff(now).toISOString() } },
    ],
  }
}

export interface LapseResult {
  /** Listings set back to Draft (or that would be, on a dry run). */
  hidden: number
  failed: number
}

export async function hideLapsedListings(
  payload: Payload,
  { now = new Date(), dryRun = false }: { now?: Date; dryRun?: boolean } = {},
): Promise<LapseResult> {
  const { docs } = await payload.find({
    collection: 'businesses',
    where: lapsedListingsWhere(now),
    depth: 0,
    limit: 0,
    overrideAccess: true,
    select: { slug: true, submission: true },
  })

  if (dryRun) return { hidden: docs.length, failed: 0 }

  let hidden = 0
  let failed = 0
  for (const doc of docs) {
    try {
      // A listing that came through the form is also marked Expired, so the
      // admin tells it apart from a new draft (20 November 2026). Publishing
      // again with a new end date makes it Approved.
      const submission = (doc as { submission?: { ownerEmail?: unknown } | null }).submission
      await payload.update({
        collection: 'businesses',
        id: doc.id,
        data: {
          _status: 'draft',
          ...(submission?.ownerEmail ? { submission: { ...submission, status: 'expired' } } : {}),
        } as never,
        depth: 0,
        overrideAccess: true,
      })
      hidden++
    } catch (error) {
      failed++
      payload.logger.error({ err: error, id: doc.id }, 'contract-lapse: could not hide listing')
    }
  }
  return { hidden, failed }
}
