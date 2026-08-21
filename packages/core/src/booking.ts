/**
 * Bookings, as domain rules rather than as a database table.
 *
 * # Every booking is an interval
 *
 * Vardenia lists hotels, restaurants, tour operators, wedding venues, clinics
 * and drivers. Those read as six different booking systems - nights, tables,
 * seats, dates, appointments, journeys - and modelling them separately would
 * mean six sets of availability rules and six ways to get double-booking wrong.
 *
 * They are all the same shape: a half-open interval `[start, end)` against one
 * business, for a number of people. A hotel stay is check-in to check-out. A
 * dinner table is 20:00 to 22:00. A clinic appointment is 09:15 to 09:45. What
 * differs between them is presentation and the config in `BookingRules`, not
 * storage and not the overlap arithmetic.
 *
 * Half-open matters and is the single most common off-by-one in booking systems:
 * a table booked 20:00-22:00 and another 22:00-00:00 do NOT overlap. Treat the
 * end as inclusive and every back-to-back booking looks like a conflict.
 */

/**
 * Where a booking is in its life.
 *
 * `pending` exists because a business may want to accept or decline rather than
 * confirm automatically - a wedding venue will, a restaurant with free tables
 * will not. Which of the two a new booking starts in is per-business config.
 */
export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no-show',
] as const

export type BookingStatus = (typeof BOOKING_STATUSES)[number]

/**
 * The statuses that occupy a place.
 *
 * This is the list the capacity check counts, and getting it wrong is the whole
 * ball game. `pending` counts: a request awaiting confirmation has to hold the
 * slot, or a restaurant with one table accepts ten requests for Friday and
 * disappoints nine people. `cancelled` and `no-show` release it. `completed`
 * describes the past and cannot conflict with anything being booked now.
 */
export const OCCUPYING_STATUSES: readonly BookingStatus[] = ['pending', 'confirmed']

export function occupiesCapacity(status: BookingStatus): boolean {
  return OCCUPYING_STATUSES.includes(status)
}

/**
 * Which status changes are legal, regardless of who is asking.
 *
 * Permission is a separate question answered in the collection - an owner may
 * confirm, a customer may only cancel. This map is about the shape of the
 * lifecycle: what is reachable from where, so a cancelled booking cannot be
 * quietly resurrected into a confirmed one and take a table with it.
 *
 * The three terminal states are terminal on purpose. Reinstating a cancellation
 * has to be a new booking, which goes through the capacity check again; editing
 * the old one back to life would not.
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['cancelled', 'completed', 'no-show'],
  cancelled: [],
  completed: [],
  'no-show': [],
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return true
  return BOOKING_TRANSITIONS[from]?.includes(to) ?? false
}

/** True for a status nothing may follow. */
export function isTerminalStatus(status: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[status].length === 0
}

// ---------------------------------------------------------------------------
// Reference codes
// ---------------------------------------------------------------------------

/**
 * Same alphabet as QR short codes - Crockford base32 without I, L, O and U, so a
 * code read aloud down a phone line survives the trip.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * Eight characters, where a printed QR code is seven.
 *
 * The difference is deliberate and it is not about collision space. Both kinds
 * of code will be read out in the same support conversations - "I scanned
 * K3M9QP2" versus "my booking is 7VTXR24B" - and a length that differs by one
 * means nobody has to wonder which kind they are holding. Same-length codes from
 * the same alphabet would be indistinguishable, and the two live in different
 * tables, so a mix-up looks like a missing record rather than a wrong lookup.
 */
export const BOOKING_REFERENCE_LENGTH = 8

export function generateBookingReference(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < BOOKING_REFERENCE_LENGTH; i++) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length)]
  }
  return code
}

/** Accepts what a customer actually types: lowercase, spaces, confusable letters. */
export function normalizeBookingReference(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V')

  if (cleaned.length !== BOOKING_REFERENCE_LENGTH) return null
  if (![...cleaned].every((char) => ALPHABET.includes(char))) return null
  return cleaned
}

// ---------------------------------------------------------------------------
// Intervals
// ---------------------------------------------------------------------------

export interface Interval {
  /** Inclusive. */
  start: Date
  /** Exclusive. */
  end: Date
}

/**
 * Do two half-open intervals share any instant?
 *
 * `a.start < b.end && b.start < a.end`, which is the whole rule. Strict on both
 * sides is what makes 20:00-22:00 and 22:00-00:00 adjacent rather than
 * conflicting.
 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime()
}

/** Length in minutes, or null if the interval is not usable. */
export function durationMinutes(interval: Interval): number | null {
  const start = interval.start.getTime()
  const end = interval.end.getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (end <= start) return null
  return Math.round((end - start) / 60_000)
}

/** An interval we can reason about: two real dates, in order. */
export function isUsableInterval(interval: Interval): boolean {
  return durationMinutes(interval) !== null
}

// ---------------------------------------------------------------------------
// Who may make a transition
// ---------------------------------------------------------------------------

/**
 * The three kinds of account that can change a booking.
 *
 * Not the collection names, deliberately. This package knows nothing about
 * Payload, and the mapping from a collection to a role belongs at the boundary
 * where `req.user` is read.
 */
export type BookingActor = 'staff' | 'owner' | 'customer'

/**
 * Which statuses each may move a booking *to*.
 *
 * `BOOKING_TRANSITIONS` says which moves are legal; this says who is allowed to
 * make them. Both are needed, and having only the first was a real hole rather
 * than a theoretical one: `pending -> confirmed` is legal, a customer may update
 * their own booking, and nothing checked the two facts together. A customer
 * could therefore confirm a booking the business had not accepted - verified by
 * doing it - which is exactly what `autoConfirm: false` exists to prevent. A
 * wedding venue wants to speak to you first, and that setting was the promise.
 *
 * A customer may only ever cancel. Marking a booking complete or a no-show is a
 * statement about what happened in the building, and only the people in the
 * building can make it.
 */
const ACTOR_TARGETS: Record<BookingActor, readonly BookingStatus[]> = {
  staff: BOOKING_STATUSES,
  owner: ['confirmed', 'cancelled', 'completed', 'no-show'],
  customer: ['cancelled'],
}

/**
 * True when this actor may move a booking from one status to another.
 *
 * `from === to` passes so that an update which does not touch the status - a
 * customer correcting their notes - is not refused for a transition it never
 * attempted.
 */
export function canActorTransition(
  actor: BookingActor,
  from: BookingStatus,
  to: BookingStatus,
): boolean {
  if (from === to) return true
  if (!canTransition(from, to)) return false
  return ACTOR_TARGETS[actor].includes(to)
}

/**
 * Outcomes that are statements about a sitting that has already happened.
 *
 * "They came and ate" and "they never turned up" are not decisions anybody can
 * make about next Monday. Offering them on a booking still in the future asks
 * the venue to predict the evening, and a mis-tap writes a no-show against a
 * customer who has done nothing wrong - which is the kind of record that follows
 * somebody around.
 */
export const RETROSPECTIVE_STATUSES = ['completed', 'no-show'] as const satisfies BookingStatus[]

export const isRetrospective = (status: BookingStatus): boolean =>
  (RETROSPECTIVE_STATUSES as readonly BookingStatus[]).includes(status)

/**
 * The moves this actor could make from here, for building a set of buttons.
 *
 * `ended` is whether the booking's own end time has passed. Before it has, the
 * retrospective outcomes are dropped and a confirmed booking offers exactly one
 * action - calling it off - which is the only thing anybody can honestly say
 * about a table that has not been sat at yet.
 *
 * It defaults to true so that a caller which has no clock, or does not care,
 * gets the full set of legal moves. Staff correcting a record are the case that
 * needs it.
 */
export function availableActions(
  actor: BookingActor,
  from: BookingStatus,
  ended: boolean = true,
): BookingStatus[] {
  return BOOKING_STATUSES.filter((to) => {
    if (to === from) return false
    if (!ended && isRetrospective(to)) return false
    return canActorTransition(actor, from, to)
  })
}
