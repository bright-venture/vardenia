import type { CollectionBeforeValidateHook } from 'payload'
import { APIError } from 'payload'
import {
  canActorTransition,
  canTransition,
  OCCUPYING_STATUSES,
  type BookingActor,
  type BookingStatus,
} from '@vardenia/core'
import { checkAvailability, unavailableMessage, type ExistingBooking } from '../lib/availability'

/**
 * Which collection a session came from, as a role.
 *
 * The two defaults go opposite ways, and the difference is the whole point:
 *
 *  - **An unrecognised collection** is a customer, the least privileged of the
 *    three. A new auth collection must not arrive with staff powers because
 *    somebody forgot to add it here.
 *  - **No user at all** is staff. On an update that state is unreachable from
 *    outside: `updateBookings` returns false without a user, so nothing
 *    anonymous ever reaches this hook. What does reach it is a local API call
 *    with `overrideAccess: true` - a seed, a migration, a support script - and
 *    those are us.
 *
 * The first version collapsed both into "customer", which refused a system write
 * with a message about what customers may do. Nothing in the app hit it today,
 * because the only `overrideAccess` write is a create and this check runs on
 * update; it was found by a probe doing exactly what a support script would.
 */
const actorFor = (collection: string | undefined): BookingActor => {
  if (collection === undefined) return 'staff'
  if (collection === 'users') return 'staff'
  if (collection === 'business-users') return 'owner'
  return 'customer'
}

/**
 * The rules a booking has to satisfy, wherever it is written from.
 *
 * This runs for the admin panel, the REST API and any future public endpoint,
 * because a `beforeValidate` hook is not something a caller can skip. That is
 * the point: an invariant enforced only in the booking form is an invariant that
 * holds until the first person uses the API.
 *
 * # What this does not do
 *
 * It does not make capacity safe. Two requests for the last table both read the
 * same "one taken, capacity two" and both pass, because neither has been written
 * yet - a check and an insert are separate statements and nothing here can join
 * them. The guarantee is a trigger in the database, added in the same migration
 * as this collection. This exists so the customer gets "fully booked at that
 * time" instead of a constraint violation.
 */

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

const asDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

export const guardBookingWrite: CollectionBeforeValidateHook = async ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  if (!data) return data

  const { payload, user } = req

  // -------------------------------------------------------------------------
  // Things that never change once a booking exists
  // -------------------------------------------------------------------------
  if (operation === 'update' && originalDoc) {
    const movedBusiness =
      data.business !== undefined && idOf(data.business) !== idOf(originalDoc.business)
    const movedCustomer =
      data.customer !== undefined && idOf(data.customer) !== idOf(originalDoc.customer)

    /**
     * Reassigning either would carry the booking's history with it - a booking
     * made against one restaurant appearing in another's list, or under a
     * customer who never made it. A change of either is a new booking.
     */
    if (movedBusiness) {
      throw new APIError('A booking cannot be moved to a different business.', 400)
    }
    if (movedCustomer) {
      throw new APIError('A booking cannot be reassigned to a different customer.', 400)
    }

    const from = originalDoc.status as BookingStatus
    const to = (data.status ?? from) as BookingStatus

    if (!canTransition(from, to)) {
      throw new APIError(
        `A booking cannot go from ${from} to ${to}. Make a new booking instead.`,
        400,
      )
    }

    /**
     * Legal is not the same as permitted, and for a while only the first was
     * checked. `pending -> confirmed` is a legal move, `updateBookings` lets a
     * customer update their own booking, and nothing put those together - so a
     * customer could confirm a booking the business had not accepted. Verified
     * by doing it before it was fixed.
     *
     * That is the one thing `autoConfirm: false` promises: a venue that wants to
     * speak to you first gets to. See canActorTransition in packages/core.
     */
    if (!canActorTransition(actorFor(user?.collection), from, to)) {
      throw new APIError(`You cannot change a booking to ${to}.`, 403)
    }
  }

  // -------------------------------------------------------------------------
  // A customer may only ever book for themselves
  // -------------------------------------------------------------------------
  if (user?.collection === 'customers') {
    // Set rather than validated: trusting a customer-supplied `customer` field
    // is how one person ends up with another's reservation.
    data.customer = user.id
  }

  if (operation !== 'create') return data

  // -------------------------------------------------------------------------
  // Availability, on create
  // -------------------------------------------------------------------------
  const businessId = idOf(data.business)
  if (businessId === null) return data

  const start = asDate(data.start)
  const end = asDate(data.end)
  if (!start || !end) return data

  const business = await payload
    .findByID({ collection: 'businesses', id: businessId, depth: 0, overrideAccess: true })
    .catch(() => null)

  if (!business) {
    throw new APIError('That business does not exist.', 400)
  }

  const rules = (business as { booking?: unknown }).booking as
    Parameters<typeof checkAvailability>[0]['rules'] | undefined

  const hours = (business as { openingHours?: unknown }).openingHours as
    Parameters<typeof checkAvailability>[0]['hours'] | undefined

  /**
   * Only the bookings that could conflict, filtered in the database.
   *
   * The overlap condition is the half-open rule expressed as a query: a booking
   * conflicts when it starts before this one ends and ends after this one
   * starts. Loading a business's whole history and filtering in memory would
   * work today and stop working at the first busy venue.
   */
  const existing = await payload.find({
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

  const occupied: ExistingBooking[] = existing.docs.flatMap((doc) => {
    const docStart = asDate((doc as { start?: unknown }).start)
    const docEnd = asDate((doc as { end?: unknown }).end)
    if (!docStart || !docEnd) return []
    return [
      {
        id: (doc as { id: string | number }).id,
        start: docStart,
        end: docEnd,
        status: (doc as { status: BookingStatus }).status,
      },
    ]
  })

  const verdict = checkAvailability({
    rules,
    hours,
    existing: occupied,
    request: {
      interval: { start, end },
      partySize: Number(data.partySize),
    },
  })

  if (!verdict.ok) {
    throw new APIError(unavailableMessage(verdict.reason), 400)
  }

  /**
   * Whether a new booking is confirmed or merely requested is the business's
   * choice, not the caller's. A restaurant with free tables confirms on the
   * spot; a wedding venue wants to speak to you first.
   *
   * Staff may still set a status explicitly - they are often entering a booking
   * that was agreed on the phone.
   */
  if (user?.collection !== 'users' || !data.status) {
    const autoConfirm = (rules as { autoConfirm?: boolean } | undefined)?.autoConfirm === true
    data.status = autoConfirm ? 'confirmed' : 'pending'
  }

  return data
}
