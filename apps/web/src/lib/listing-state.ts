/**
 * One word for where a listing stands, for the admin's State column
 * (20 November 2026): Draft, Published, Rejected or Expired.
 *
 * Worked out on read, not stored. A listing's own status is only Draft or
 * Published, and a lapsed one goes back to Draft (lib/contract-lapse), so on
 * its own an expired listing looked like a new draft. This tells them apart:
 *
 * - Rejected: the submission was rejected (it can never be published).
 * - Published: live on the site.
 * - Expired: hidden because its contract ended, marked by the daily job on a
 *   submitted listing, or a contract end date already past.
 * - Incomplete / Abandoned: a Magazine Places form the owner has not finished,
 *   or gave up (lib/place-abandon). Not work for staff, so not "Draft".
 * - Draft: anything else not live (a new submission waiting for review, or a
 *   listing the team is preparing).
 */

export const LISTING_STATES = [
  'draft',
  'published',
  'rejected',
  'expired',
  'incomplete',
  'abandoned',
] as const
export type ListingState = (typeof LISTING_STATES)[number]

const DAY_MS = 24 * 60 * 60 * 1000

interface ListingLike {
  _status?: unknown
  contractEndsAt?: unknown
  submission?: { status?: unknown } | null
}

export function listingState(
  listing: ListingLike | null | undefined,
  now = new Date(),
): ListingState {
  const review = listing?.submission?.status
  if (review === 'rejected') return 'rejected'
  if (listing?._status === 'published') return 'published'
  if (review === 'incomplete' || review === 'abandoned') return review
  if (review === 'expired') return 'expired'

  const ends =
    typeof listing?.contractEndsAt === 'string' || listing?.contractEndsAt instanceof Date
      ? new Date(listing.contractEndsAt).getTime()
      : Number.NaN
  // Same one-day grace as the daily job (lib/contract-lapse).
  if (Number.isFinite(ends) && ends < now.getTime() - DAY_MS) return 'expired'
  return 'draft'
}

/**
 * A form the owner is still filling in or gave up. Such a record is not a
 * listing the team has to work on, so reports that list work to do (the gap
 * worklist) leave it out.
 */
export function isUnfinishedForm(listing: ListingLike | null | undefined): boolean {
  const review = listing?.submission?.status
  return review === 'incomplete' || review === 'abandoned'
}
