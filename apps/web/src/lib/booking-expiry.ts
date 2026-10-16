import { timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'

/**
 * Requests nobody answered, declined when their time arrives.
 *
 * A booking request stays `pending` until the venue accepts or declines it.
 * Before this, one the venue never answered stayed pending for ever: the guest
 * never heard back, could not tell whether to turn up, and the request kept
 * counting as a held place. Now, once its start time has passed, it is set to
 * cancelled and the guest gets the "no answer from the venue" email.
 *
 * # What runs it
 *
 * A Netlify scheduled function (netlify/functions/expire-bookings.mts) calls
 * POST /booking/expire every 15 minutes, with CRON_SECRET as a bearer token.
 * So a request is declined at most about 15 minutes after its start time.
 *
 * # What it writes, and what it does not
 *
 * Through Payload, so the booking guard checks the transition and the status
 * hooks run. `context.autoDeclined` tells notifyBookingStatus to send the
 * guest the expired email and to leave the venue alone: the request was
 * theirs to answer. No `answeredAt` is stamped, because nobody answered, so
 * the venue's answer-time figures are not flattered by it.
 */

/**
 * Requests declined in one run; the rest wait for the next, 15 minutes on.
 * Small because each one sends an email and the route has the length of one
 * serverless invocation to finish in.
 */
export const EXPIRY_BATCH = 20

export interface ExpiryResult {
  declined: number
  failed: number
}

export async function expireUnansweredBookings(
  payload: Payload,
  now: Date = new Date(),
): Promise<ExpiryResult> {
  const due = await payload.find({
    collection: 'bookings',
    where: {
      and: [{ status: { equals: 'pending' } }, { start: { less_than_equal: now.toISOString() } }],
    },
    sort: 'start',
    limit: EXPIRY_BATCH,
    depth: 0,
    overrideAccess: true,
  })

  const result: ExpiryResult = { declined: 0, failed: 0 }

  for (const booking of due.docs) {
    /**
     * Written as "this booking, if it is STILL pending" rather than by id.
     *
     * The venue may accept the request between the read above and this write.
     * By id, the write would then cancel a booking that had just been confirmed,
     * and the guest would be told nobody answered. With the status in the
     * condition, an answered request simply matches nothing. guardBookingWrite
     * refuses the same thing again, for the instant between the two.
     */
    try {
      const outcome = await payload.update({
        collection: 'bookings',
        where: { and: [{ id: { equals: booking.id } }, { status: { equals: 'pending' } }] },
        data: { status: 'cancelled' },
        depth: 0,
        overrideAccess: true,
        context: { autoDeclined: true },
      })
      result.declined += outcome.docs.length
      result.failed += outcome.errors.length
    } catch {
      result.failed += 1
    }
  }

  return result
}

/**
 * Whether a request carries the scheduler's secret.
 *
 * No secret configured means no request is accepted: an endpoint that cancels
 * bookings must not be open because a variable was forgotten. Compared in
 * constant time, so the response time says nothing about how much matched.
 */
export function isSchedulerRequest(
  authorization: string | null,
  secret: string | undefined = process.env.CRON_SECRET,
): boolean {
  const expected = secret?.trim()
  if (!expected || !authorization) return false

  const given = Buffer.from(authorization)
  const wanted = Buffer.from(`Bearer ${expected}`)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}
