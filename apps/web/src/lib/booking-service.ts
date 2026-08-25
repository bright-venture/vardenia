import type { Payload } from 'payload'

import type { BookingRequest } from '@vardenia/core'
import { checkAvailability, unavailableMessage, type ExistingBooking } from './availability'
import { OCCUPYING_STATUSES, type BookingStatus } from '@vardenia/core'

/**
 * Turning a request into a booking.
 *
 * One place, because the operation is not one write. It finds or creates the
 * customer, checks availability for a useful message, inserts, and confirms by
 * email - and the interesting part is what happens when those disagree with each
 * other.
 *
 * # The capacity race, and where it surfaces
 *
 * `checkAvailability` runs first so a customer who is plainly too late gets
 * "fully booked at that time" rather than a database error. It cannot be the
 * guarantee: two requests for the last table both pass it, because neither has
 * been written yet. The guarantee is the trigger installed by
 * 20260818_181600_booking_capacity_trigger, which serialises concurrent inserts
 * for a business and refuses the second.
 *
 * So the insert can fail *after* a successful check, and that is not an
 * exceptional case - it is the normal outcome of two people booking at once.
 * `translateInsertError` turns that specific failure back into the same message
 * the check would have produced. Without it, losing the race means a 500 and a
 * customer who thinks the site is broken rather than the table is taken.
 */

export type BookingOutcome =
  | { ok: true; reference: string; status: BookingStatus; bookingId: number }
  | { ok: false; code: 'unavailable' | 'not-found' | 'rate-limited' | 'error'; message: string }

/** Postgres raises this when the capacity trigger refuses an insert. */
const CAPACITY_MESSAGE = 'fully booked'

/**
 * How many bookings one email may hold, awaiting confirmation, at one time.
 *
 * Not a general rate limit - lib/rate-limit does that per request. This is the
 * abuse shape specific to bookings: filling a small restaurant's evening with
 * requests nobody intends to honour. Pending bookings occupy capacity, so a
 * handful from one address is enough to close a place for the night.
 *
 * Counted in the database rather than in memory, which matters on serverless:
 * an in-memory counter is per instance, so the real ceiling is this number times
 * however many instances happen to be warm.
 */
const MAX_PENDING_PER_CUSTOMER = 5

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Guest bookings, and why this file no longer creates customers.
 *
 * A booking used to accept any email address and create a customer record for
 * it - `findOrCreateCustomer`, with an unguessable password nobody knew, so the
 * address owner could claim it later through a password reset. That made
 * booking frictionless, which was right while a booking was a request for a
 * table and nothing more.
 *
 * It stopped being right once a booking can carry a deposit. Money needs a
 * party you can identify and reach, and "whatever was typed into a form" is
 * neither. Booking now requires a signed-in customer with a verified address;
 * the route establishes that and passes the id in.
 *
 * Records created the old way are untouched and still work. Their owners can
 * still claim them at /account/signup, which sends a reset rather than a
 * duplicate-account error - see /auth/reset, whose comment describes exactly
 * this path.
 */

/** Bookings this customer already holds that occupy a place. */
export async function pendingBookingCount(payload: Payload, customerId: number): Promise<number> {
  const result = await payload.find({
    collection: 'bookings',
    where: {
      and: [
        { customer: { equals: customerId } },
        { status: { in: [...OCCUPYING_STATUSES] } },
        { start: { greater_than: new Date().toISOString() } },
      ],
    },
    limit: 0,
    depth: 0,
    overrideAccess: true,
  })
  return result.totalDocs
}

/**
 * The bookings that could conflict, filtered in the database.
 *
 * The overlap condition is the half-open rule as a query: a booking conflicts
 * when it starts before this one ends and ends after this one starts.
 */
export async function overlappingBookings(
  payload: Payload,
  businessId: number,
  start: Date,
  end: Date,
): Promise<ExistingBooking[]> {
  const result = await payload.find({
    collection: 'bookings',
    depth: 0,
    limit: 200,
    pagination: false,
    overrideAccess: true,
    where: {
      and: [
        { business: { equals: businessId } },
        { status: { in: [...OCCUPYING_STATUSES] } },
        { start: { less_than: end.toISOString() } },
        { end: { greater_than: start.toISOString() } },
      ],
    },
  })

  return result.docs.flatMap((doc) => {
    const start = new Date(doc.start)
    const end = new Date(doc.end)
    // A row with unparseable dates cannot conflict with anything, and guessing
    // at what it meant would be worse than leaving it out of the count.
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
    return [{ id: doc.id, start, end, status: doc.status }]
  })
}

/**
 * Turn a failed insert back into something a customer can read.
 *
 * Only the capacity trigger is translated. Everything else stays an error,
 * because a message invented for a failure we do not recognise is worse than an
 * honest one - it tells the customer to try a different time when the real
 * problem might be that the database is down.
 */
export function translateInsertError(error: unknown): BookingOutcome {
  const message = isRecord(error) && typeof error.message === 'string' ? error.message : ''

  if (message.toLowerCase().includes(CAPACITY_MESSAGE)) {
    return { ok: false, code: 'unavailable', message: unavailableMessage('at-capacity') }
  }

  return {
    ok: false,
    code: 'error',
    message: 'We could not complete that booking. Please try again.',
  }
}

export interface CreateBookingArgs {
  payload: Payload
  request: BookingRequest
  /**
   * The signed-in customer this booking belongs to.
   *
   * Passed in rather than derived from the request, and that is the whole
   * change: a booking used to create a customer record from whatever address
   * was typed into the form, so anybody could book under anybody's email. Once
   * a booking can carry a deposit, the party on the other end has to be a
   * proven account rather than a string somebody entered.
   *
   * The route establishes this from the session and refuses without one. See
   * /booking/request.
   */
  customerId: number
  now?: Date
}

export async function createBooking({
  payload,
  request,
  customerId,
  now = new Date(),
}: CreateBookingArgs): Promise<BookingOutcome> {
  const start = new Date(request.start)
  const end = new Date(request.end)

  const business = await payload
    .findByID({
      collection: 'businesses',
      id: request.business as string,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)

  /**
   * A draft listing is not bookable, and says the same thing as one that does
   * not exist. Distinguishing them would let anyone enumerate unpublished
   * listings by watching which ids answer differently.
   */
  if (!business || (business as { _status?: string })._status === 'draft') {
    return { ok: false, code: 'not-found', message: 'That listing is not available for booking.' }
  }

  const rules = (business as { booking?: unknown }).booking as Parameters<
    typeof checkAvailability
  >[0]['rules']
  const hours = (business as { openingHours?: unknown }).openingHours as Parameters<
    typeof checkAvailability
  >[0]['hours']

  const existing = await overlappingBookings(payload, business.id, start, end)

  const verdict = checkAvailability({
    rules,
    hours,
    existing,
    now,
    request: { interval: { start, end }, partySize: request.partySize },
  })

  if (!verdict.ok) {
    return {
      ok: false,
      code: 'unavailable',
      message: unavailableMessage(verdict.reason, request.locale ?? 'en'),
    }
  }

  const pending = await pendingBookingCount(payload, customerId)
  if (pending >= MAX_PENDING_PER_CUSTOMER) {
    return {
      ok: false,
      code: 'rate-limited',
      message: `You already have ${pending} upcoming bookings. Please cancel one before making another.`,
    }
  }

  try {
    const booking = await payload.create({
      collection: 'bookings',
      data: {
        business: business.id,
        customer: customerId,
        start: start.toISOString(),
        end: end.toISOString(),
        partySize: request.partySize,
        ...(request.notes ? { notes: request.notes } : {}),

        /**
         * Stored so every later message reaches them in the language they
         * booked in. See the field on the Bookings collection - the hooks that
         * send those messages have no request to read it from.
         */
        locale: request.locale ?? 'en',

        /**
         * Sent because the field is required, then overwritten.
         *
         * `guardBookingWrite` decides the real value from the listing's
         * `autoConfirm` setting - a restaurant with free tables confirms on the
         * spot, a wedding venue wants to speak to you first. That decision
         * belongs to the business, not to whoever is calling this, so the value
         * here is only ever a placeholder that satisfies the type.
         */
        status: 'pending',
      },
      overrideAccess: true,
    })

    return {
      ok: true,
      bookingId: booking.id,
      reference: String((booking as { reference?: unknown }).reference ?? ''),
      status: (booking as { status: BookingStatus }).status,
    }
  } catch (error) {
    return translateInsertError(error)
  }
}
