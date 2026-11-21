import type { Payload } from 'payload'

import type { BookingRequest } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import {
  checkAvailability,
  occupiedDays,
  unavailableMessage,
  UNAVAILABLE_REASONS,
  type ClosedPeriod,
  type ExistingBooking,
} from './availability'
import {
  canHaveRoomTypes,
  canTakeBookings,
  OCCUPYING_STATUSES,
  resolveSeatingArea,
  seatingAreasOf,
  splitParty,
  type BookingStatus,
} from '@vardenia/core'
import { checkSeatingRequest } from './seating-booking'
import {
  checkRoomRequest,
  optionLabel,
  roomStayInterval,
  roomsSummary,
  stayNights,
} from './room-availability'
import { roomBookingsFor, roomTypesFor } from './room-booking'
import { beirutDate } from './beirut'
import { checkStayRequest, isWholeProperty, stayConfigOf, stayInterval } from './stay-booking'
import { priceSnapshotData, quoteRefusalMessage, roomQuote, stayQuote } from './booking-price'

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
  | {
      ok: true
      reference: string
      status: BookingStatus
      bookingId: number
      /** For the venue's email, which names the listing and the room. */
      businessId: number
      businessName: string
      roomType?: string
      /** The times actually booked, when the server set them (room bookings). */
      start?: string
      end?: string
      /** A retry of an attempt that had already made this booking. */
      replayed?: boolean
      /** The total of the price snapshot stored, USD (Task 7); absent when none. */
      total?: number
    }
  | {
      ok: false
      /** 'invalid': a request that cannot be priced as sent (an unknown package). */
      code: 'unavailable' | 'not-found' | 'rate-limited' | 'invalid' | 'error'
      message: string
    }

/** Postgres raises this when the capacity trigger refuses an insert. */
const CAPACITY_MESSAGE = 'fully booked'
/** Raised by the room inventory trigger; see the room types migration. */
const ROOMS_MESSAGE = 'not enough rooms'
/** Raised by the enforce_customer_booking_limit trigger; see translateInsertError. */
const CUSTOMER_LIMIT_MESSAGE = 'most upcoming bookings allowed'
const CUSTOMER_PENDING_MESSAGE = 'most booking requests waiting'
/**
 * Raised by the capacity trigger (Task 8, migrations-sql/
 * seating-capacity-trigger.sql) for an area the listing no longer has: a
 * partner removed it between the check and the insert.
 */
const AREA_MESSAGE = 'seating area is not offered'

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

/**
 * Two limits per customer (21 November 2026, authentication audit, decided by
 * the owner): at most MAX_PENDING_PER_CUSTOMER requests waiting for a place's
 * answer, and at most MAX_UPCOMING_PER_CUSTOMER upcoming bookings in total
 * (pending or confirmed). One limit of 5 upcoming stopped a real traveller
 * planning a week (a hotel, three dinners, a tour); spamming requests is still
 * capped at 5 unanswered. The database holds the same two numbers
 * (migration customer_booking_limits_two).
 */
const MAX_UPCOMING_PER_CUSTOMER = 15

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

/** This customer's upcoming bookings: waiting for an answer, and in total. */
export async function upcomingBookingCounts(
  payload: Payload,
  customerId: number,
): Promise<{ pending: number; upcoming: number }> {
  const ahead = { start: { greater_than: new Date().toISOString() } }
  const mine = { customer: { equals: customerId } }
  const [pending, upcoming] = await Promise.all([
    payload.count({
      collection: 'bookings',
      where: { and: [mine, { status: { equals: 'pending' } }, ahead] },
      overrideAccess: true,
    }),
    payload.count({
      collection: 'bookings',
      where: { and: [mine, { status: { in: [...OCCUPYING_STATUSES] } }, ahead] },
      overrideAccess: true,
    }),
  ])
  return { pending: pending.totalDocs, upcoming: upcoming.totalDocs }
}

/**
 * The refusal when a new booking would pass a limit, or null. `willWait` is
 * false for a place that confirms on the spot: such a booking never waits, so
 * only the total applies to it.
 */
export function limitRefusal(
  counts: { pending: number; upcoming: number },
  willWait: boolean,
): { ok: false; code: 'rate-limited'; message: string } | null {
  if (counts.upcoming >= MAX_UPCOMING_PER_CUSTOMER) {
    return {
      ok: false,
      code: 'rate-limited',
      message: `You already have ${MAX_UPCOMING_PER_CUSTOMER} upcoming bookings. Please cancel one before making another.`,
    }
  }
  if (willWait && counts.pending >= MAX_PENDING_PER_CUSTOMER) {
    return {
      ok: false,
      code: 'rate-limited',
      message: `You already have ${MAX_PENDING_PER_CUSTOMER} booking requests waiting for an answer. Please wait for a reply, or cancel one, before making another.`,
    }
  }
  return null
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
    // The seating area (Task 8): only read at a restaurant with areas.
    const area = (doc as { area?: string | null }).area ?? null
    return [{ id: doc.id, start, end, status: doc.status, area }]
  })
}

/**
 * The venue's closed dates that overlap a booking from `start` to `end`.
 *
 * Shared by the booking service, /booking/availability and guardBookingWrite,
 * so the form's live check, the booking and the insert give the same answer
 * about a closed day.
 *
 * Bounded on both sides to the days the booking occupies (`occupiedDays`, the
 * same rule `checkAvailability` applies). It used to ask for every closure not
 * yet over, cut to 50 rows in no order, so a venue that had entered more than
 * 50 future closed days could have the one that mattered left out and be
 * booked on it. Now everything returned overlaps the booking, and a single row
 * is enough to refuse, so no limit can hide the answer.
 */
export async function closedPeriods(
  payload: Payload,
  businessId: number | string,
  start: Date,
  end: Date,
): Promise<ClosedPeriod[]> {
  const [firstDay, lastDay] = occupiedDays(start, end)
  const result = await payload.find({
    collection: 'closures',
    depth: 0,
    limit: 10,
    pagination: false,
    overrideAccess: true,
    where: {
      and: [
        { business: { equals: businessId } },
        { startsOn: { less_than_equal: lastDay } },
        { endsOn: { greater_than_equal: firstDay } },
      ],
    },
    select: { startsOn: true, endsOn: true },
  })
  return result.docs.map((doc) => ({
    startsOn: String((doc as { startsOn?: unknown }).startsOn ?? ''),
    endsOn: String((doc as { endsOn?: unknown }).endsOn ?? ''),
  }))
}

interface AttemptBooking {
  id: number
  reference?: string | null
  status: BookingStatus
  roomType?: string | null
}

/**
 * The booking this customer already made with this attempt id, if any.
 * Scoped to the customer, so an id can never return somebody else's booking.
 */
export async function bookingForAttempt(
  payload: Payload,
  customerId: number,
  requestId: string,
): Promise<AttemptBooking | null> {
  const found = await payload.find({
    collection: 'bookings',
    where: {
      and: [{ customer: { equals: customerId } }, { requestId: { equals: requestId } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return (found.docs[0] as unknown as AttemptBooking | undefined) ?? null
}

/** The original answer, again. `replayed` tells the route not to email twice. */
function replayOf(made: AttemptBooking, business: { id: unknown; name?: unknown }): BookingOutcome {
  return {
    ok: true,
    replayed: true,
    bookingId: made.id,
    reference: String(made.reference ?? ''),
    status: made.status,
    businessId: Number(business.id),
    businessName: String(business.name ?? ''),
    ...(made.roomType ? { roomType: made.roomType } : {}),
  }
}

/** The honest failure: we do not know what went wrong, so we do not guess. */
const COULD_NOT_BOOK: Record<Locale, string> = {
  en: 'We could not complete that booking. Please try again.',
  ar: 'تعذّر علينا إتمام هذا الحجز. يرجى المحاولة مرة أخرى.',
  fr: "Nous n'avons pas pu finaliser cette réservation. Veuillez réessayer.",
  es: 'No hemos podido completar esa reserva. Inténtalo de nuevo.',
  pt: 'Não conseguimos concluir essa reserva. Tente de novo.',
  ru: 'Не удалось завершить бронирование. Попробуйте ещё раз.',
  zh: '我们未能完成这次预订，请重试。',
  hi: 'हम यह बुकिंग पूरी नहीं कर सके। कृपया फिर से कोशिश करें।',
  bn: 'আমরা বুকিংটি সম্পন্ন করতে পারিনি। দয়া করে আবার চেষ্টা করুন।',
  ur: 'ہم یہ بکنگ مکمل نہیں کر سکے۔ براہِ کرم دوبارہ کوشش کریں۔',
}

/** What guardBookingWrite says when a listed-only place is asked for a booking. */
const LISTED_ONLY_MESSAGE = 'listed only and does not take bookings'

/**
 * Turn a failed insert back into something a customer can read.
 *
 * Only refusals we recognise are translated: the capacity trigger, and every
 * reason the booking guard can give (it words them with `unavailableMessage`,
 * in English). Everything else stays an error, because a message invented for a
 * failure we do not recognise is worse than an honest one - it tells the
 * customer to try a different time when the real problem might be that the
 * database is down.
 *
 * The guard's reasons used to fall through to "We could not complete that
 * booking", reported as an unexpected error: a closed date added after the
 * page loaded looked to the guest like a broken site, and to the team like a
 * bug.
 */
export function translateInsertError(error: unknown, locale: Locale = 'en'): BookingOutcome {
  const message = isRecord(error) && typeof error.message === 'string' ? error.message : ''
  const lower = message.toLowerCase()

  /*
   * In the customer's language. This took no language at all, so the customer
   * who lost the race for the last table was told "fully booked" in English -
   * on the Arabic site too, not only on the eight newer languages.
   */
  if (lower.includes(ROOMS_MESSAGE)) {
    return { ok: false, code: 'unavailable', message: unavailableMessage('rooms-full', locale) }
  }

  if (lower.includes(AREA_MESSAGE)) {
    return { ok: false, code: 'unavailable', message: unavailableMessage('area-unknown', locale) }
  }

  if (lower.includes(CAPACITY_MESSAGE)) {
    return { ok: false, code: 'unavailable', message: unavailableMessage('at-capacity', locale) }
  }

  if (lower.includes(LISTED_ONLY_MESSAGE)) {
    return {
      ok: false,
      code: 'unavailable',
      message: unavailableMessage('bookings-disabled', locale),
    }
  }

  const reason = UNAVAILABLE_REASONS.find((candidate) =>
    lower.includes(unavailableMessage(candidate, 'en').toLowerCase()),
  )
  if (reason) {
    return { ok: false, code: 'unavailable', message: unavailableMessage(reason, locale) }
  }

  /*
   * The database's own copy of the per-customer limit, for the requests that
   * raced past the count above. Same answer as the count gives. See the
   * customer_booking_limit migration.
   */
  if (message.toLowerCase().includes(CUSTOMER_LIMIT_MESSAGE)) {
    return limitRefusal({ pending: 0, upcoming: MAX_UPCOMING_PER_CUSTOMER }, false)!
  }
  if (message.toLowerCase().includes(CUSTOMER_PENDING_MESSAGE)) {
    return limitRefusal({ pending: MAX_PENDING_PER_CUSTOMER, upcoming: 0 }, true)!
  }

  return { ok: false, code: 'error', message: COULD_NOT_BOOK[locale] ?? COULD_NOT_BOOK.en }
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

  /**
   * A retry of an attempt that already succeeded: the guest pressed "book",
   * the booking was made, and the answer was lost on the way back. Answered
   * with that booking, before any check - checked again, the guest's own first
   * booking could make the slot look full.
   */
  if (request.requestId) {
    const made = await bookingForAttempt(payload, customerId, request.requestId)
    if (made) return replayOf(made, business)
  }

  const rules = (business as { booking?: unknown }).booking as Parameters<
    typeof checkAvailability
  >[0]['rules']
  const hours = (business as { openingHours?: unknown }).openingHours as Parameters<
    typeof checkAvailability
  >[0]['hours']

  // Asked here as well as in the guard, so the answer is "this place does not
  // take bookings" rather than an error from the insert.
  if (!canTakeBookings((business as { subcategories?: string[] | null }).subcategories ?? [])) {
    return {
      ok: false,
      code: 'unavailable',
      message: unavailableMessage('bookings-disabled', request.locale ?? 'en'),
    }
  }

  // A guest house is a whole property first, even one also filed as a hotel:
  // never room lines (core canHaveRoomTypes is false for any getaway).
  if (request.rooms && request.rooms.length > 0) {
    // Only hotels sell rooms (core ROOM_TYPE_SUBCATEGORIES). A guest house
    // sent room lines by a stale page or a crafted request is told the rooms
    // are not offered, rather than having them counted.
    if (!canHaveRoomTypes((business as { subcategories?: string[] | null }).subcategories ?? [])) {
      return {
        ok: false,
        code: 'unavailable',
        message: unavailableMessage('room-unknown', request.locale ?? 'en'),
      }
    }
    return createRoomBooking({ payload, request, customerId, now, business, rules })
  }

  if (isWholeProperty(business)) {
    return createStayBooking({ payload, request, customerId, now, business, rules })
  }

  const [existing, closures] = await Promise.all([
    overlappingBookings(payload, business.id, start, end),
    closedPeriods(payload, business.id, start, end),
  ])

  /*
   * Restaurant seating areas (Task 8, core/seating): with areas, the guest's
   * area is required and counted against its own tables only; without, the
   * listing's capacity as always (and an area sent anyway is not stored).
   */
  const areas = seatingAreasOf(business as never)
  const verdict = checkSeatingRequest({
    rules,
    hours,
    closures,
    existing,
    areas,
    area: request.area,
    now,
    request: { interval: { start, end }, partySize: request.partySize },
  })
  const seated = resolveSeatingArea(areas, request.area)
  const area = seated.ok && seated.area ? seated.area.key : undefined

  if (!verdict.ok) {
    return {
      ok: false,
      code: 'unavailable',
      message: unavailableMessage(verdict.reason, request.locale ?? 'en'),
    }
  }

  const overLimit = limitRefusal(
    await upcomingBookingCounts(payload, customerId),
    (rules as { autoConfirm?: boolean } | undefined)?.autoConfirm !== true,
  )
  if (overLimit) return overLimit

  /**
   * Keep the requested room type only if the listing actually offers it. The
   * form sends a label the customer chose from the same list, but a stale page
   * or a crafted request could send anything, and an arbitrary string on a
   * booking helps no one. A mismatch is dropped rather than refused - the room
   * type is a note for the venue, not a condition of the booking.
   */
  const roomTypeLabels = (rules?.roomTypes ?? [])
    .map((entry) => (typeof entry?.label === 'string' ? entry.label.trim() : ''))
    .filter((label) => label.length > 0)
  const roomType =
    request.roomType && roomTypeLabels.includes(request.roomType) ? request.roomType : undefined

  try {
    const booking = await payload.create({
      collection: 'bookings',
      data: {
        business: business.id,
        customer: customerId,
        start: start.toISOString(),
        end: end.toISOString(),
        partySize: request.partySize,
        ...(roomType ? { roomType } : {}),
        ...(area ? { area } : {}),
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

        ...(request.requestId ? { requestId: request.requestId } : {}),
      },
      overrideAccess: true,
    })

    return {
      ok: true,
      bookingId: booking.id,
      reference: String((booking as { reference?: unknown }).reference ?? ''),
      status: (booking as { status: BookingStatus }).status,
      businessId: Number(business.id),
      businessName: String((business as { name?: unknown }).name ?? ''),
      ...(roomType ? { roomType } : {}),
    }
  } catch (error) {
    /**
     * Two copies of the same attempt that arrived together: the first made the
     * booking and this one was refused, by the unique index on the attempt id
     * or by the capacity trigger counting the first. Either way the booking the
     * guest asked for exists, so it is the answer.
     */
    if (request.requestId) {
      const made = await bookingForAttempt(payload, customerId, request.requestId)
      if (made) return replayOf(made, business)
    }
    return translateInsertError(error, request.locale ?? 'en')
  }
}

/**
 * A booking of rooms at a hotel with room types (17 November 2026).
 *
 * The times are the hotel's own: check-in on the first day to check-out after
 * the nights, whatever the form sent, so every room booking counts the same
 * nights the database trigger counts. The lines carry a copy of the room's name
 * and the option's wording, and `roomType` on the booking gets the summary
 * ("2 × Deluxe Twin"), which is what the account page, the admin and the
 * emails already show.
 */
async function createRoomBooking({
  payload,
  request,
  customerId,
  now,
  business,
  rules,
}: {
  payload: Payload
  request: BookingRequest
  customerId: number
  now: Date
  business: { id: number | string; name?: unknown }
  rules: Parameters<typeof checkAvailability>[0]['rules']
}): Promise<BookingOutcome> {
  const locale = request.locale ?? 'en'
  const requestedStart = new Date(request.start)
  const requestedEnd = new Date(request.end)
  const interval = roomStayInterval(
    beirutDate(requestedStart),
    stayNights(requestedStart, requestedEnd).length,
    rules,
  )
  if (!interval) {
    return {
      ok: false,
      code: 'unavailable',
      message: unavailableMessage('invalid-interval', locale),
    }
  }

  const businessId = Number(business.id)
  const [typesBy, existingBy, closures] = await Promise.all([
    roomTypesFor(payload, [businessId], { locale }),
    roomBookingsFor(payload, [businessId], interval.start, interval.end),
    closedPeriods(payload, businessId, interval.start, interval.end),
  ])
  const types = typesBy.get(businessId) ?? []
  const lines = (request.rooms ?? []).map((line) => ({
    roomType: line.roomType,
    count: line.count,
    option: line.option ?? null,
  }))

  const verdict = checkRoomRequest({
    rules,
    closures,
    types,
    existing: existingBy.get(businessId) ?? [],
    request: {
      interval,
      guests: request.partySize,
      adults: splitParty(request.partySize, request.children).adults,
      lines,
    },
    now,
  })
  if (!verdict.ok) {
    return { ok: false, code: 'unavailable', message: unavailableMessage(verdict.reason, locale) }
  }

  const overLimit = limitRefusal(
    await upcomingBookingCounts(payload, customerId),
    (rules as { autoConfirm?: boolean } | undefined)?.autoConfirm !== true,
  )
  if (overLimit) return overLimit

  /*
   * The price at booking time (Task 7): the room types just loaded, the same
   * function the page's quote uses. An unpriced option stores no snapshot and
   * never blocks the booking; nothing the client sent is read.
   */
  const quote = roomQuote(types, lines, stayNights(interval.start, interval.end).length)
  const price = quote.ok ? priceSnapshotData(quote, now) : null

  const rows = lines.map((line) => {
    const type = types.find((candidate) => candidate.id === line.roomType)
    const option =
      type?.options.find((candidate) => candidate.id === line.option) ?? type?.options[0]
    return {
      roomType: line.roomType,
      count: line.count,
      roomName: type?.name ?? '',
      optionId: option?.id ?? '',
      optionLabel: optionLabel(option),
    }
  })
  const summary = roomsSummary(rows)

  try {
    const booking = await payload.create({
      collection: 'bookings',
      data: {
        business: businessId,
        customer: customerId,
        start: interval.start.toISOString(),
        end: interval.end.toISOString(),
        partySize: request.partySize,
        children: splitParty(request.partySize, request.children).children,
        roomType: summary,
        rooms: rows,
        ...(request.notes ? { notes: request.notes } : {}),
        locale,
        status: 'pending',
        ...(request.requestId ? { requestId: request.requestId } : {}),
        ...(price ? { price } : {}),
      },
      overrideAccess: true,
      // Lets guardBookingWrite keep the snapshot: only this service writes it.
      ...(price ? { context: { priceSnapshot: true } } : {}),
    })
    return {
      ok: true,
      bookingId: booking.id,
      reference: String((booking as { reference?: unknown }).reference ?? ''),
      status: (booking as { status: BookingStatus }).status,
      businessId,
      businessName: String(business.name ?? ''),
      roomType: summary,
      start: interval.start.toISOString(),
      end: interval.end.toISOString(),
      ...(price ? { total: price.total } : {}),
    }
  } catch (error) {
    if (request.requestId) {
      const made = await bookingForAttempt(payload, customerId, request.requestId)
      if (made) return replayOf(made, business)
    }
    return translateInsertError(error, locale)
  }
}

/**
 * A guest house booked as a whole property (Task 6, 20 November 2026). See
 * lib/stay-booking: the stay runs from check-in on the first day to check-out
 * after the nights, whatever the form sent; one stay at a time; at least the
 * owner's minimum nights and no more guests than their cap. The insert then
 * goes through guardBookingWrite and the capacity trigger like any booking.
 */
async function createStayBooking({
  payload,
  request,
  customerId,
  now,
  business,
  rules,
}: {
  payload: Payload
  request: BookingRequest
  customerId: number
  now: Date
  business: { id: number | string; name?: unknown }
  rules: Parameters<typeof checkAvailability>[0]['rules']
}): Promise<BookingOutcome> {
  const locale = request.locale ?? 'en'
  const interval = stayInterval(new Date(request.start), new Date(request.end), rules)
  if (!interval) {
    return {
      ok: false,
      code: 'unavailable',
      message: unavailableMessage('invalid-interval', locale),
    }
  }

  // At least one adult, as at a hotel (core splitParty, shared with the guard).
  const { children } = splitParty(request.partySize, request.children)
  const businessId = Number(business.id)
  const [existing, closures] = await Promise.all([
    overlappingBookings(payload, businessId, interval.start, interval.end),
    closedPeriods(payload, businessId, interval.start, interval.end),
  ])

  const verdict = checkStayRequest({
    rules,
    closures,
    existing,
    stay: stayConfigOf(business),
    request: { interval, adults: request.partySize - children, children },
    now,
  })
  if (!verdict.ok) {
    return { ok: false, code: 'unavailable', message: unavailableMessage(verdict.reason, locale) }
  }

  /*
   * The price (Task 7): core quoteStay on the listing's stay config, the same
   * function the page's quote uses. A package that is not on the listing, or
   * switched off, is refused rather than priced as the nightly rate. No price
   * set ('no-price') books without a snapshot. The limits were checked above
   * by checkStayRequest, which uses the same core rule as the quote.
   */
  const quote = stayQuote({
    stay: stayConfigOf(business),
    nights: stayNights(interval.start, interval.end).length,
    partySize: request.partySize,
    children,
    packageId: request.packageId,
  })
  if (!quote.ok && quote.reason !== 'no-price') {
    const limit = quote.reason === 'below-min-nights' || quote.reason === 'above-max-guests'
    return {
      ok: false,
      code: limit ? 'unavailable' : 'invalid',
      message: quoteRefusalMessage(quote.reason, locale),
    }
  }
  const price = quote.ok ? priceSnapshotData(quote, now) : null

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
        business: businessId,
        customer: customerId,
        start: interval.start.toISOString(),
        end: interval.end.toISOString(),
        partySize: request.partySize,
        children,
        ...(price ? { price } : {}),
        ...(request.notes ? { notes: request.notes } : {}),
        locale,
        // Placeholder; guardBookingWrite sets it from the listing's autoConfirm.
        status: 'pending',
        ...(request.requestId ? { requestId: request.requestId } : {}),
      },
      overrideAccess: true,
      // Lets guardBookingWrite keep the snapshot: only this service writes it.
      ...(price ? { context: { priceSnapshot: true } } : {}),
    })
    return {
      ok: true,
      bookingId: booking.id,
      reference: String((booking as { reference?: unknown }).reference ?? ''),
      status: (booking as { status: BookingStatus }).status,
      businessId,
      businessName: String(business.name ?? ''),
      start: interval.start.toISOString(),
      end: interval.end.toISOString(),
      ...(price ? { total: price.total } : {}),
    }
  } catch (error) {
    if (request.requestId) {
      const made = await bookingForAttempt(payload, customerId, request.requestId)
      if (made) return replayOf(made, business)
    }
    return translateInsertError(error, locale)
  }
}
