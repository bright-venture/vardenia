import type { Payload } from 'payload'
import type { ReviewRequest } from '@vardenia/core'

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
      code: 'not-eligible' | 'already-reviewed' | 'not-found' | 'error'
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
   * Eligibility: a booking here, by this customer, that stood and is over.
   *
   * This asked for `completed` alone, and almost nobody could ever have
   * satisfied it. Nothing moves a booking to `completed` on its own - a venue
   * marks it by hand in the partner dashboard, and most never will. A guest who
   * ate at a restaurant last week was told they had not booked there.
   *
   * So a confirmed booking whose end time has passed counts too. The two other
   * past states are deliberately excluded and are the reason this is a status
   * test rather than a date one: `cancelled` means they did not go, and
   * `no-show` means they did not turn up. Neither is a visit, and a review from
   * either is exactly the review this rule exists to refuse. `pending` is out
   * as well, since the venue never accepted it.
   */
  const stood = await payload.find({
    collection: 'bookings',
    where: {
      and: [
        { customer: { equals: customerId } },
        { business: { equals: business.id } },
        {
          or: [
            { status: { equals: 'completed' } },
            {
              and: [
                { status: { equals: 'confirmed' } },
                { end: { less_than: new Date().toISOString() } },
              ],
            },
          ],
        },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const booking = stood.docs[0]
  if (!booking) return { ok: false, code: 'not-eligible' }

  // One review per customer per listing.
  const existing = await payload.find({
    collection: 'reviews',
    where: {
      and: [{ customer: { equals: customerId } }, { business: { equals: business.id } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs[0]) return { ok: false, code: 'already-reviewed' }

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
  } catch {
    return { ok: false, code: 'error' }
  }
}
