import { isUniqueViolation } from './db-errors'
import type { Payload } from 'payload'
import type { ReviewRequest } from '@vardenia/core'
import { reviewEligibility } from './review-eligibility'

/**
 * Turning a review request into a pending review.
 *
 * The eligibility rule is the whole point: a customer may review a listing only
 * when they have a booking there that stood and is over, and only once. Both
 * checks run against the database with the customer's id from the session, never
 * from the request, so a crafted call cannot review a place the caller never
 * went or flood a listing with more than one voice.
 *
 * Everything it writes is fixed here - status pending, the author name snapshot,
 * the customer and the specific booking - so nothing the client sent can set a
 * review live or attribute it to someone else.
 */

export type ReviewOutcome =
  | { ok: true; reviewId: number }
  | {
      ok: false
      code: 'not-eligible' | 'already-reviewed' | 'not-found' | 'not-bookable' | 'error'
    }

/**
 * A first name and a last initial, e.g. "Rania H." - enough to read as a person,
 * not enough to be a full identity on a public page. Falls back to "Guest" when
 * the account has no usable name.
 */
export function reviewAuthorName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  if (!first) return 'Guest'
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined
  const initial = last ? last[0]?.toUpperCase() : ''
  return initial ? `${first} ${initial}.` : first
}

export interface CreateReviewArgs {
  payload: Payload
  request: ReviewRequest
  customerId: number
  customerName: string
}

/** Completed bookings read per query while looking for an eligible one. */
const COMPLETED_PAGE = 20
/** A bound on the paging (2,000 completed visits at one listing). */
const MAX_COMPLETED_PAGES = 100

export async function createReview({
  payload,
  request,
  customerId,
  customerName,
}: CreateReviewArgs): Promise<ReviewOutcome> {
  const business = await payload
    .findByID({
      collection: 'businesses',
      id: request.business as string,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)

  // A draft listing is not reviewable and reads the same as one that does not
  // exist, so an unpublished listing cannot be probed by who can review it.
  if (!business || (business as { _status?: string })._status === 'draft') {
    return { ok: false, code: 'not-found' }
  }

  /**
   * The rule lives in lib/review-eligibility, shared with the account page.
   * Reviews exist only for bookable services, and only a booking the business
   * marked `completed` counts (not `confirmed`, even once over; a guest who
   * answered that they did not come is refused too). Checked on the listing
   * first, so a booking row that should not exist does not make a cafe
   * reviewable.
   */
  const completedPage = (page: number) =>
    payload.find({
      collection: 'bookings',
      where: {
        and: [
          { customer: { equals: customerId } },
          { business: { equals: business.id } },
          { status: { equals: 'completed' } },
        ],
      },
      sort: 'id',
      limit: COMPLETED_PAGE,
      page,
      depth: 0,
      overrideAccess: true,
    })

  // One review per customer per listing, which covers once per booking: the
  // customer, the listing and the booking they review through all go together.
  const existing = await payload.find({
    collection: 'reviews',
    where: {
      and: [{ customer: { equals: customerId } }, { business: { equals: business.id } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const facts = {
    subcategories: (business as { subcategories?: string[] | null }).subcategories,
    bookingEnabled: (business as { booking?: { enabled?: boolean } | null }).booking?.enabled,
    alreadyReviewed: Boolean(existing.docs[0]),
  }
  type Candidate = Awaited<ReturnType<typeof completedPage>>['docs'][number]
  let booking: Candidate | undefined
  let seen = 0
  let refusal: Exclude<ReturnType<typeof reviewEligibility>, { ok: true }> = {
    ok: false,
    code: 'not-eligible',
  }
  // Every completed booking of this customer at this listing, page by page,
  // until one is eligible: a regular with many visits (some answered "did
  // not come") is judged on all of them, not on the first page only.
  // A refusal that is about the listing or an existing review, not about the
  // booking, is the same for every booking: no need to read further.
  let settled = false
  for (let page = 1; !booking && !settled && page <= MAX_COMPLETED_PAGES; page++) {
    const stood = await completedPage(page)
    for (const candidate of stood.docs) {
      seen++
      const verdict = reviewEligibility({
        ...facts,
        status: candidate.status,
        guestAnswer: (candidate as { guestAnswer?: string | null }).guestAnswer,
      })
      if (verdict.ok) {
        booking = candidate
        break
      }
      refusal = verdict
      if (verdict.code !== 'not-eligible') {
        settled = true
        break
      }
    }
    if (!stood.hasNextPage) break
  }
  if (!booking) {
    // No booking at all still reads from the listing and review state.
    if (seen === 0) {
      const verdict = reviewEligibility({ ...facts, status: undefined })
      return { ok: false, code: verdict.ok ? 'not-eligible' : verdict.code }
    }
    return { ok: false, code: refusal.code }
  }

  try {
    const review = await payload.create({
      collection: 'reviews',
      data: {
        business: business.id,
        customer: customerId,
        booking: booking.id,
        rating: request.rating,
        ...(request.title ? { title: request.title } : {}),
        body: request.body,
        authorName: reviewAuthorName(customerName),
        // Fixed here, never taken from the request: a review is not public until
        // a staff member publishes it.
        status: 'pending',
      },
      overrideAccess: true,
    })
    return { ok: true, reviewId: Number(review.id) }
  } catch (error) {
    // Two submissions at once both pass the check above; the database's unique
    // index on (customer, listing) refuses the second. See the
    // one_review_and_statement migration.
    if (isUniqueViolation(error)) return { ok: false, code: 'already-reviewed' }
    return { ok: false, code: 'error' }
  }
}
