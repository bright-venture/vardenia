import { getPayload } from 'payload'
import { bookingRequestSchema, fieldErrors } from '@vardenia/core'
import config from '../../../payload.config'
import { createBooking } from '../../../lib/booking-service'
import { sendBookingConfirmation } from '../../../lib/booking-email'
import { withRateLimit } from '../../../lib/rate-limit'
import { reportError } from '../../../lib/report'

/**
 * The public booking endpoint.
 *
 * The only way a booking is created from outside the admin. `bookings.create` in
 * Payload stays staff-only precisely so this is true: a generic REST create
 * accepts whatever fields the caller sends, which would let a request skip the
 * availability check, choose its own status, or book on somebody else's behalf.
 * One door, with the checks behind it.
 *
 * Not under /api, because Payload owns that. See the availability route.
 *
 * # Confirmation email is sent after the booking, and cannot undo it
 *
 * A booking that exists but whose email failed is a customer who turns up to a
 * table that is genuinely reserved. A booking rolled back because an email
 * provider had a bad minute is a customer who does not. The first is recoverable
 * by a phone call, the second is silent - so the write wins and the email is
 * allowed to fail loudly in the logs.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

/** Maps a refusal to the status code that describes it. */
const STATUS_FOR = {
  unavailable: 409,
  'not-found': 404,
  'rate-limited': 429,
  error: 500,
} as const

export const POST = withRateLimit(async (request: Request) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, message: 'Expected a JSON body.' }, 400)
  }

  const parsed = bookingRequestSchema.safeParse(body)
  if (!parsed.success) {
    return json({ ok: false, errors: fieldErrors(parsed.error) }, 400)
  }

  const payload = await getPayload({ config })
  const outcome = await createBooking({ payload, request: parsed.data })

  if (!outcome.ok) {
    // Reported because "unavailable" is ordinary and "error" is not; without
    // this the two are indistinguishable in production. The email is not
    // attached - lib/report would scrub it anyway, and a booking that failed is
    // a bug in our code rather than a fact about the customer.
    if (outcome.code === 'error') {
      await reportError(new Error(outcome.message), {
        source: 'booking.request',
        path: '/booking/request',
        group: 'booking.request.unexpected',
        extra: { business: parsed.data.business },
      })
    }
    return json({ ok: false, message: outcome.message }, STATUS_FOR[outcome.code])
  }

  /**
   * Awaited rather than fired and forgotten, so a failure is logged against this
   * request rather than surfacing as an unhandled rejection with no context.
   * It still cannot fail the booking - see the note at the top.
   */
  await sendBookingConfirmation({
    payload,
    to: parsed.data.email,
    name: parsed.data.name,
    reference: outcome.reference,
    status: outcome.status,
    start: new Date(parsed.data.start),
    end: new Date(parsed.data.end),
    partySize: parsed.data.partySize,
    locale: parsed.data.locale ?? 'en',
  }).catch(async (error) => {
    /**
     * The most consequential silent failure in the product. The booking is real
     * and the customer has no message saying so, which they discover by turning
     * up or by not turning up. The reference is attached because it is the one
     * thing that makes this recoverable by hand.
     */
    await reportError(error, {
      source: 'booking.confirmation-email',
      path: '/booking/request',
      extra: { reference: outcome.reference },
    })
  })

  /**
   * The reference is the whole receipt. It is what the customer quotes on the
   * phone and the only handle they have on the booking, so it goes back even
   * though the email carries it too - an email that lands in spam should not
   * cost somebody their reference.
   */
  return json({ ok: true, reference: outcome.reference, status: outcome.status }, 201)
})
