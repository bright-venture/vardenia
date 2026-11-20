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
 * - Draft: anything else not live (a new submission waiting for review, or a
 *   listing the team is preparing).
 */

export const LISTING_STATES = ['draft', 'published', 'rejected', 'expired'] as const
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
  if (review === 'expired') return 'expired'

  const ends =
    typeof listing?.contractEndsAt === 'string' || listing?.contractEndsAt instanceof Date
      ? new Date(listing.contractEndsAt).getTime()
      : Number.NaN
  // Same one-day grace as the daily job (lib/contract-lapse).
  if (Number.isFinite(ends) && ends < now.getTime() - DAY_MS) return 'expired'
  return 'draft'
}
