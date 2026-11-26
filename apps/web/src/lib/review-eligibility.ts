import { canTakeBookings } from '@vardenia/core'

/**
 * Whether a customer may review a listing, from one booking.
 *
 * The one rule, shared by the /reviews route (lib/review-service) and the account
 * page that offers the link, so the page never invites a review the route will
 * refuse. Reviews exist only for bookable services; the customer books, the
 * business marks the visit `completed`, and only then can they review, once per
 * listing. `confirmed` is not enough even when its time has passed. A guest who
 * answered that they did not come is refused whatever the business marked.
 *
 * Order matters for the code a caller sees: the listing first, then the booking,
 * then the one-per-listing rule.
 */
export type ReviewEligibility =
  { ok: true } | { ok: false; code: 'not-bookable' | 'not-eligible' | 'already-reviewed' }

export interface ReviewEligibilityFacts {
  status?: string | null
  guestAnswer?: string | null
  subcategories?: readonly string[] | null
  bookingEnabled?: boolean | null
  alreadyReviewed: boolean
}

export function reviewEligibility(facts: ReviewEligibilityFacts): ReviewEligibility {
  if (facts.bookingEnabled !== true || !canTakeBookings(facts.subcategories ?? [])) {
    return { ok: false, code: 'not-bookable' }
  }
  if (facts.status !== 'completed' || facts.guestAnswer === 'did-not-come') {
    return { ok: false, code: 'not-eligible' }
  }
  if (facts.alreadyReviewed) return { ok: false, code: 'already-reviewed' }
  return { ok: true }
}
