import type { CollectionBeforeValidateHook, PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { APIError } from 'payload'
import {
  canActorTransition,
  canHaveRoomTypes,
  canTakeBookings,
  canTransition,
  isRetrospective,
  splitParty,
  OCCUPYING_STATUSES,
  resolveSeatingArea,
  seatingAreasOf,
  type BookingActor,
  type BookingStatus,
} from '@vardenia/core'
import { checkAvailability, unavailableMessage, type ExistingBooking } from '../lib/availability'
import { closedPeriods } from '../lib/booking-service'
import { checkRoomRequest } from '../lib/room-availability'
import { roomBookingsFor, roomTypesFor } from '../lib/room-booking'
import { checkStayRequest, isWholeProperty, stayConfigOf } from '../lib/stay-booking'
import { transactionDb } from '../lib/transaction-db'
import { lockBookingSlots } from '../lib/booking-lock'
import { checkSeatingRequest } from '../lib/seating-booking'

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

/** Whether an update changes when the booking is, where it sits, or how many it seats. */
function movesSlot(data: Record<string, unknown>, before: Record<string, unknown>): boolean {
  const time = (value: unknown) => asDate(value)?.getTime() ?? null
  if (data.start !== undefined && time(data.start) !== time(before.start)) return true
  if (data.end !== undefined && time(data.end) !== time(before.end)) return true
  // A restaurant seating area (Task 8) is a capacity of its own.
  if (data.area !== undefined && (data.area ?? null) !== (before.area ?? null)) return true
  return data.partySize !== undefined && Number(data.partySize) !== Number(before.partySize)
}

export const guardBookingWrite: CollectionBeforeValidateHook = async ({
  data,
  req,
  operation,
  originalDoc,
  context,
}) => {
  if (!data) return data

  const { payload, user } = req

  /**
   * The price snapshot (Task 7) is the booking service's alone: it flags its
   * own create in the server-only context. Any other create - staff in the
   * admin or by REST, a script - has the field dropped. Every update - a
   * guest, a venue or staff, by PATCH, the admin or a script - gets the
   * stored snapshot back (a copy, the same thing Payload writes for a field
   * an update leaves out), so it never drifts and is never recomputed, not
   * even when staff move the dates. Field access refuses it through the API
   * as well (collections/Bookings).
   */
  if (operation === 'update') {
    const stored = (originalDoc as { price?: unknown } | undefined)?.price
    if (stored !== undefined && stored !== null) data.price = structuredClone(stored)
    else delete data.price
  } else if (context?.priceSnapshot !== true) {
    delete data.price
  }

  /**
   * How many rooms a hotel booking holds, kept in step with its lines on
   * every write that sends them. The database reads it before the lines exist
   * (see the roomCount field on Bookings).
   */
  if (Array.isArray(data.rooms)) {
    data.roomCount = (data.rooms as { count?: unknown }[]).reduce(
      (sum, line) => sum + Math.max(0, Math.floor(Number(line?.count ?? 0)) || 0),
      0,
    )
  }

  /**
   * Children are part of the party, and at least one guest is an adult: the
   * same split the booking service makes (core splitParty), so a direct write
   * cannot store 5 children in a party of 2. Clamped rather than refused, as
   * the service does. Applied whenever a write sets either number.
   */
  if (data.children !== undefined || data.partySize !== undefined) {
    const party = Number(data.partySize ?? originalDoc?.partySize)
    if (Number.isFinite(party) && party >= 1) {
      data.children = splitParty(
        party,
        Number(data.children ?? originalDoc?.children ?? 0) || 0,
      ).children
    }
  }

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

    // The automatic decline is only for a request nobody answered. If the venue
    // answered a moment ago, it must not undo that (see lib/booking-expiry).
    if (context?.autoDeclined === true && from !== 'pending') {
      throw new APIError(
        'This request has been answered, so it is not declined automatically.',
        409,
      )
    }

    if (!canTransition(from, to)) {
      throw new APIError(
        `A booking cannot go from ${from} to ${to}. Make a new booking instead.`,
        400,
      )
    }

    /**
     * Two changes at the same moment: the venue accepts while the guest cancels.
     * Both read "pending", both pass the checks above, and whichever wrote last
     * used to win silently - the guest told "cancelled", the booking left
     * "confirmed". So a status change locks the booking's row for the rest of
     * this save and reads its status again. The second save waits for the first
     * to finish, sees the status it left, and is refused instead of undoing it.
     */
    if (to !== from) {
      const now = await lockedStatus(req, (originalDoc as { id?: unknown }).id)
      if (now !== null && now !== from) {
        throw new APIError(
          `This booking was changed a moment ago and is now ${now.replace('-', ' ')}. Reload to see it.`,
          409,
        )
      }
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
    const actor = actorFor(user?.collection)

    if (!canActorTransition(actor, from, to)) {
      throw new APIError(`You cannot change a booking to ${to}.`, 403)
    }

    /**
     * A venue marking a visit as done says what the guest spent, in the same
     * save. The commission is taken of that amount (core/booking-fees), and a
     * venue that could mark visits without one would never be billed. Staff
     * are exempt: they close out bookings the venue never answered, and the
     * guest's own figure covers those.
     */
    if (actor === 'owner' && to === 'completed' && from !== 'completed') {
      const amount = Number(data.amount ?? (originalDoc as { amount?: unknown }).amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new APIError('Enter what the guest spent to mark the visit as done.', 400)
      }
    }

    /**
     * An outcome cannot be recorded before the thing it is an outcome of.
     *
     * The partner dashboard stopped offering "Mark as done" and "Did not arrive"
     * on a booking still in the future, and this is the same rule on the server
     * so the two cannot drift. Without it the buttons are a suggestion: a PATCH
     * to /api/bookings/:id would still write a no-show against a customer whose
     * table is next Monday.
     *
     * Staff are exempt. They enter bookings that were agreed on the phone and
     * correct records after the fact, and the end time on a row somebody is
     * repairing is not evidence of anything.
     */
    if (actor !== 'staff' && isRetrospective(to) && !isRetrospective(from)) {
      const end = new Date(String((data.end ?? originalDoc.end) as string)).getTime()

      if (Number.isFinite(end) && end > Date.now()) {
        throw new APIError(
          'This booking has not happened yet, so it cannot be marked as done or as a no-show.',
          400,
        )
      }
    }

    /**
     * And the mirror of it: a customer cannot call off a sitting that is over.
     *
     * The account page was offering "Cancel this booking" on a confirmed table
     * from the week before, because the button asked only what the status was
     * and never what the time was. Fixing the button alone would leave the same
     * PATCH available to anyone who sent it by hand, so the rule lives here too.
     *
     * Only the customer. An owner voiding a booking after the fact is a venue
     * correcting its own record, and staff are exempt from the timing rules
     * above for the same reason.
     */
    if (actor === 'customer' && to === 'cancelled' && from !== 'cancelled') {
      const end = new Date(String((data.end ?? originalDoc.end) as string)).getTime()

      if (Number.isFinite(end) && end <= Date.now()) {
        throw new APIError(
          'This booking has already happened, so it can no longer be cancelled.',
          400,
        )
      }
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

  // -------------------------------------------------------------------------
  // Availability: on create, and when staff move an existing booking
  // -------------------------------------------------------------------------
  /**
   * A booking moved to another night, or grown to a bigger party, has to fit
   * as much as a new one does. It used to be checked on create only, so staff
   * editing the dates of a confirmed booking could put two parties on one
   * table without a word. Only staff reach this: for a guest or a venue the
   * dates and party size are not writable at all (see the Bookings fields).
   *
   * A booking that has already happened, or was called off, keeps its dates:
   * they are what a fee statement and a no-show dispute are argued from.
   */
  let self: string | number | null = null

  if (operation === 'update') {
    if (!originalDoc || actorFor(user?.collection) !== 'staff' || !movesSlot(data, originalDoc)) {
      return data
    }
    const status = (data.status ?? originalDoc.status) as BookingStatus
    if (!(OCCUPYING_STATUSES as readonly string[]).includes(status)) {
      throw new APIError(
        `This booking is ${status.replace('-', ' ')}, so its date and party size can no longer change.`,
        400,
      )
    }
    self = (originalDoc as { id: string | number }).id
  } else if (operation !== 'create') {
    return data
  }

  const businessId = idOf(data.business ?? originalDoc?.business)
  if (businessId === null) return data

  const start = asDate(data.start ?? originalDoc?.start)
  const end = asDate(data.end ?? originalDoc?.end)
  if (!start || !end) return data

  const business = await payload
    .findByID({ collection: 'businesses', id: businessId, depth: 0, overrideAccess: true })
    .catch(() => null)

  if (!business) {
    throw new APIError('That business does not exist.', 400)
  }

  /**
   * Pools, cafes, nightlife, festivals, historic sites, gyms and malls are
   * listed, never booked. The admin refuses to switch booking on for them, but
   * that is one form; a listing moved to Cafes after booking was switched on, or
   * any path that skips the form, would otherwise still take a table. New
   * bookings only: one already made stays where it is. See core/taxonomy.
   */
  if (
    operation === 'create' &&
    !canTakeBookings((business as { subcategories?: string[] | null }).subcategories ?? [])
  ) {
    throw new APIError('This place is listed only and does not take bookings.', 400)
  }

  const rules = (business as { booking?: unknown }).booking as
    Parameters<typeof checkAvailability>[0]['rules'] | undefined

  const hours = (business as { openingHours?: unknown }).openingHours as
    Parameters<typeof checkAvailability>[0]['hours'] | undefined

  /**
   * A hotel booking with room lines is counted against its room types, night
   * by night, not against the listing's single capacity (17 November 2026).
   */
  const roomLines = (
    (Array.isArray(data.rooms) ? data.rooms : originalDoc?.rooms) as
      { roomType?: unknown; count?: unknown; optionId?: unknown }[] | undefined
  )?.flatMap((line) => {
    const roomType = Number(idOf(line?.roomType))
    const count = Number(line?.count ?? 0)
    return Number.isFinite(roomType) && count > 0
      ? [{ roomType, count, option: typeof line.optionId === 'string' ? line.optionId : null }]
      : []
  })

  if (roomLines && roomLines.length > 0) {
    /*
     * Rooms only at a hotel (core ROOM_TYPE_SUBCATEGORIES; getaways stopped
     * having room types on 20 November 2026). New bookings only: a booking
     * made before that keeps its lines.
     */
    if (
      operation === 'create' &&
      !canHaveRoomTypes((business as { subcategories?: string[] | null }).subcategories ?? [])
    ) {
      throw new APIError(unavailableMessage('room-unknown'), 400)
    }
    const id = Number(businessId)
    const [typesBy, existingBy, closures] = await Promise.all([
      roomTypesFor(payload, [id], { req }),
      roomBookingsFor(payload, [id], start, end, req),
      closedPeriods(payload, businessId, start, end),
    ])
    const verdict = checkRoomRequest({
      rules,
      closures,
      types: typesBy.get(id) ?? [],
      existing: existingBy.get(id) ?? [],
      request: {
        interval: { start, end },
        guests: Number(data.partySize ?? originalDoc?.partySize ?? 1),
        adults: splitParty(
          Number(data.partySize ?? originalDoc?.partySize ?? 1),
          Number(data.children ?? originalDoc?.children ?? 0) || 0,
        ).adults,
        lines: roomLines.map((line) => ({ ...line, option: null })),
        ...(self !== null ? { excludeBookingId: self } : {}),
      },
    })
    if (!verdict.ok) throw new APIError(unavailableMessage(verdict.reason), 400)

    if (operation === 'create' && (user?.collection !== 'users' || !data.status)) {
      const autoConfirm = (rules as { autoConfirm?: boolean } | undefined)?.autoConfirm === true
      data.status = autoConfirm ? 'confirmed' : 'pending'
    }
    return data
  }

  /**
   * A hotel with room types is booked from its room lines: a new booking
   * without any would be judged only by the listing's single capacity, with no
   * room inventory and no price. Refused for customers and the booking service;
   * staff may still enter one in the admin.
   */
  if (
    operation === 'create' &&
    user?.collection !== 'users' &&
    canHaveRoomTypes((business as { subcategories?: string[] | null }).subcategories ?? [])
  ) {
    const id = Number(businessId)
    const typesBy = await roomTypesFor(payload, [id], { req })
    if ((typesBy.get(id)?.length ?? 0) > 0) {
      throw new APIError(unavailableMessage('no-rooms-chosen'), 400)
    }
  }

  /**
   * Restaurant seating areas (Task 8, core/seating). A listing without areas
   * books as it always did, and an area sent to it is dropped (the database
   * trigger would refuse an area the listing does not have). A listing with
   * areas counts a booking only against its area's tables, so its count is
   * taken under the listing's booking lock (lib/booking-lock): two requests
   * for the last table in an area queue here, and the second counts after
   * the first has committed. The capacity trigger takes the same lock, so
   * listings without areas keep exactly the guarantee they had.
   */
  const wholeProperty = isWholeProperty(business)
  let areas = wholeProperty ? [] : seatingAreasOf(business as never)
  const requestedArea = (data.area !== undefined ? data.area : originalDoc?.area) as
    string | null | undefined
  if (areas.length === 0) {
    // On update too: an area on a listing without areas would be refused by
    // the trigger and is meaningless to the venue.
    if (operation === 'create' || data.area !== undefined) data.area = null
  } else {
    /*
     * An area booking stays an area booking: clearing it would turn it into
     * a booking judged only against the listing's capacity. Staff move it to
     * another area instead.
     */
    if (originalDoc?.area && data.area !== undefined && !data.area) {
      throw new APIError(
        'A booking at a restaurant with seating areas keeps a seating area. Choose another area instead of clearing it.',
        400,
      )
    }
    await lockBookingSlots(req, businessId)
    /*
     * Read the areas again now that the lock is held: a partner's removal or
     * shrink (hooks/protectSeatingAreaBookings takes the same lock) may have
     * committed while this request waited, and the decision must be on what
     * is stored now. Read on the pool, which sees everything committed.
     */
    const fresh = await payload
      .findByID({ collection: 'businesses', id: businessId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!fresh) throw new APIError('That business does not exist.', 400)
    areas = seatingAreasOf(fresh as never)
    // Every area removed meanwhile: the listing books as one without areas.
    if (areas.length === 0) data.area = null
  }

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
        // As the database trigger counts: room bookings (room_count > 0) are
        // counted against room types, not the listing's capacity. A guest house
        // keeps counting every booking, as it always has.
        ...(wholeProperty
          ? []
          : [{ or: [{ roomCount: { equals: 0 } }, { roomCount: { exists: false } }] }]),
      ],
    },
  })

  /**
   * The days this venue has said it is shut.
   *
   * Read with access overridden, because this hook runs as whoever is booking -
   * a customer, who cannot read the Closures collection at all - and the
   * ordinary path would find nothing. A closure nobody can see is a closure that
   * does not close anything.
   *
   * Only the periods that overlap this booking's own days, bounded on both
   * sides, through the same lookup as the booking service and the form's live
   * check (closedPeriods). Bounded on one side only, as this was, a venue with
   * more than 50 future closures could have the relevant one cut off.
   */
  const closures = await closedPeriods(payload, businessId, start, end)

  const occupied: ExistingBooking[] = existing.docs.flatMap((doc) => {
    // A moved booking does not compete with where it used to be.
    if (self !== null && String((doc as { id: unknown }).id) === String(self)) return []
    const docStart = asDate((doc as { start?: unknown }).start)
    const docEnd = asDate((doc as { end?: unknown }).end)
    if (!docStart || !docEnd) return []
    return [
      {
        id: (doc as { id: string | number }).id,
        start: docStart,
        end: docEnd,
        status: (doc as { status: BookingStatus }).status,
        area: ((doc as { area?: unknown }).area as string | null | undefined) ?? null,
      },
    ]
  })

  /**
   * A guest house is one property: one stay at a time, at least the owner's
   * minimum nights, at most their guest cap (lib/stay-booking, Task 6). The
   * same overlapping bookings, read the same way, are counted against a
   * capacity of 1.
   */
  const partySize = Number(data.partySize ?? originalDoc?.partySize)
  const children = Number.isFinite(partySize)
    ? splitParty(partySize, Number(data.children ?? originalDoc?.children ?? 0) || 0).children
    : 0
  /*
   * A booking made before the listing had areas, moved by staff, stays
   * without one: judged as the trigger judges it, against the listing's
   * capacity and the other bookings without an area.
   */
  const legacyAtAreas = areas.length > 0 && self !== null && !requestedArea
  const verdict = wholeProperty
    ? checkStayRequest({
        rules,
        closures,
        existing: occupied,
        stay: stayConfigOf(business),
        request: {
          interval: { start, end },
          adults: partySize - children,
          children,
          ...(self !== null ? { excludeBookingId: self } : {}),
        },
      })
    : legacyAtAreas
      ? checkAvailability({
          rules,
          hours,
          closures,
          existing: occupied.filter((booking) => !booking.area),
          request: { interval: { start, end }, partySize },
        })
      : checkSeatingRequest({
          rules,
          hours,
          closures,
          existing: occupied,
          areas,
          area: requestedArea,
          request: {
            interval: { start, end },
            partySize,
          },
        })

  if (!verdict.ok) {
    throw new APIError(unavailableMessage(verdict.reason), 400)
  }

  if (areas.length > 0 && !legacyAtAreas) {
    const resolved = resolveSeatingArea(areas, requestedArea)
    if (resolved.ok && resolved.area) data.area = resolved.area.key
  }

  /**
   * Whether a new booking is confirmed or merely requested is the business's
   * choice, not the caller's. A restaurant with free tables confirms on the
   * spot; a wedding venue wants to speak to you first.
   *
   * Staff may still set a status explicitly - they are often entering a booking
   * that was agreed on the phone.
   */
  if (operation === 'create' && (user?.collection !== 'users' || !data.status)) {
    const autoConfirm = (rules as { autoConfirm?: boolean } | undefined)?.autoConfirm === true
    data.status = autoConfirm ? 'confirmed' : 'pending'
  }

  return data
}

/**
 * The booking's status as stored right now, with its row locked until this
 * save's transaction ends. Null when it cannot be asked (no database in
 * reach, or an id that is not a number), in which case the save goes ahead
 * as it always did.
 *
 * Runs on the save's own transaction, which Payload opens for every update,
 * so the lock is held through the write and released at commit; the same
 * lookup Payload's own `getTransaction` does, which the adapter does not
 * export. `FOR UPDATE` makes a second save of the same booking wait here,
 * then read the status the first one committed.
 */
export async function lockedStatus(
  req: PayloadRequest,
  id: unknown,
): Promise<BookingStatus | null> {
  const bookingId = Number(id)
  const db = await transactionDb(req)
  if (!db || !Number.isInteger(bookingId)) return null

  const result = await db.execute(
    sql`SELECT "status" FROM "payload"."bookings" WHERE "id" = ${bookingId} FOR UPDATE`,
  )
  const row = result.rows?.[0] as { status?: unknown } | undefined
  return typeof row?.status === 'string' ? (row.status as BookingStatus) : null
}
