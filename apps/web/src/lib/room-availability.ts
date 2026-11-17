import { occupiesCapacity, type BookingStatus } from '@vardenia/core'
import {
  checkAvailability,
  type Availability,
  type BookingRules,
  type ClosedPeriod,
} from './availability'
import { addDays, beirutDate, beirutInstant } from './beirut'
import { CHECK_IN, CHECK_OUT } from './booking-form'

/**
 * Can these rooms be booked for these nights?
 *
 * The hotel side of booking (17 November 2026), modelled on Booking.com: a
 * hotel lists room types, each with a number of identical rooms, and a guest
 * asks for some rooms of one or more types. A type is full on a night when the
 * rooms already held that night, plus the ones asked for, would pass its
 * number of rooms. Every night of the stay is checked, because a type can be
 * free on Friday and full on Saturday.
 *
 * A pure function of the request, the hotel's rules, its room types and the
 * room bookings that already exist, like checkAvailability, and advisory in
 * the same way: the database trigger installed with the room types migration
 * is the guarantee when two guests take the last room at once.
 *
 * Restaurants never come here. A booking without room lines goes through
 * checkAvailability exactly as before.
 */

/** One way a room type is sold. See the Room types collection. */
export interface RoomOption {
  id: string
  breakfast?: boolean | null
  cancellation?: 'free' | 'non-refundable' | null
  freeCancellationDays?: number | null
  payment?: 'at-property' | 'in-advance' | null
}

/**
 * Nights a room type is open, and how many rooms are sold on them (the Room
 * dates collection). Inclusive, as Beirut nights.
 */
export interface OpenPeriod {
  id?: number
  startsOn: string
  endsOn: string
  rooms: number
}

export interface RoomTypeInventory {
  id: number
  name?: string | null
  /** How many identical rooms in all. What is sold is set per night by `periods`. */
  rooms: number
  /**
   * The nights opened by the hotel. A night no period covers is closed
   * (decided 17 November 2026). Left undefined, every night sells `rooms`:
   * only for callers that do not load periods, never for a booking.
   */
  periods?: OpenPeriod[]
  sleepsAdults: number
  sleepsChildren?: number | null
  active?: boolean | null
  kind?: 'room' | 'suite' | null
  views?: string[] | null
  options: RoomOption[]
}

/** One line of a request or of a booking: some rooms of one type. */
export interface RoomLine {
  roomType: number
  count: number
  option?: string | null
}

/** A room booking that already exists, reduced to what the count needs. */
export interface ExistingRoomBooking {
  id?: number | string
  start: Date
  end: Date
  status: BookingStatus
  lines: RoomLine[]
}

/** What a guest may filter room types by, on the directory and on a hotel. */
export interface RoomFilters {
  breakfast?: boolean
  freeCancellation?: boolean
  view?: string | null
  kind?: 'room' | 'suite' | null
}

export const MAX_ROOMS_PER_BOOKING = 10

const MINUTES_PER_DAY = 1440

/** A duration rule kept only when it is already in whole days. */
const nightsLimit = (value: number | null | undefined, fallback: number): number =>
  typeof value === 'number' && value >= MINUTES_PER_DAY ? value : fallback

/** Sleeps, adults and children together, never below one. */
export const sleeps = (type: Pick<RoomTypeInventory, 'sleepsAdults' | 'sleepsChildren'>): number =>
  Math.max(1, Math.floor(type.sleepsAdults || 1)) +
  Math.max(0, Math.floor(type.sleepsChildren ?? 0))

/**
 * The Beirut nights a stay holds, as "YYYY-MM-DD": arriving on the 10th and
 * leaving on the 12th holds the nights of the 10th and the 11th.
 */
export function stayNights(start: Date, end: Date): string[] {
  const first = beirutDate(start)
  const leave = beirutDate(end)
  const nights: string[] = []
  for (let day = first; day < leave && nights.length < 366; day = addDays(day, 1)) {
    nights.push(day)
  }
  // A stay that starts and ends on the same Beirut day still holds that night.
  return nights.length > 0 ? nights : [first]
}

/** The interval a room booking asks for: check-in on the day to check-out after the nights. */
export function roomStayInterval(
  date: string,
  nights: number,
  rules: BookingRules | null | undefined,
): { start: Date; end: Date } | null {
  const r = (rules ?? {}) as { checkInTime?: string | null; checkOutTime?: string | null }
  const checkIn = r.checkInTime || CHECK_IN
  const checkOut = r.checkOutTime || CHECK_OUT
  const n = Math.floor(nights)
  if (!Number.isFinite(n) || n < 1) return null
  const start = beirutInstant(date, checkIn)
  const end = beirutInstant(addDays(date, n), checkOut)
  return start && end ? { start, end } : null
}

/** Rooms of one type already held on each night of a stay. */
export function roomsTakenByNight(
  roomType: number,
  existing: readonly ExistingRoomBooking[],
  nights: readonly string[],
  excludeBookingId?: number | string,
): Map<string, number> {
  const taken = new Map<string, number>(nights.map((night) => [night, 0]))
  for (const booking of existing) {
    if (!occupiesCapacity(booking.status)) continue
    if (excludeBookingId !== undefined && String(booking.id) === String(excludeBookingId)) continue
    const count = booking.lines
      .filter((line) => line.roomType === roomType)
      .reduce((sum, line) => sum + Math.max(0, Math.floor(line.count)), 0)
    if (count === 0) continue
    for (const night of stayNights(booking.start, booking.end)) {
      if (taken.has(night)) taken.set(night, (taken.get(night) ?? 0) + count)
    }
  }
  return taken
}

/**
 * Rooms this type sells on one night: the last-saved period covering it, or
 * none (closed). Never more than the rooms it has.
 */
export function roomsOnNight(type: RoomTypeInventory, night: string): number {
  if (!type.periods) return Math.max(0, Math.floor(type.rooms))
  let best: OpenPeriod | null = null
  for (const period of type.periods) {
    if (period.startsOn <= night && period.endsOn >= night) {
      if (!best || (period.id ?? 0) >= (best.id ?? 0)) best = period
    }
  }
  return best ? Math.max(0, Math.min(Math.floor(best.rooms), Math.floor(type.rooms))) : 0
}

/** Free rooms of this type on each night of the stay. */
export function nightlyFree(
  type: RoomTypeInventory,
  existing: readonly ExistingRoomBooking[],
  interval: { start: Date; end: Date },
  excludeBookingId?: number | string,
): { night: string; free: number }[] {
  if (type.active === false) return []
  const nights = stayNights(interval.start, interval.end)
  const taken = roomsTakenByNight(type.id, existing, nights, excludeBookingId)
  return nights.map((night) => ({
    night,
    free: Math.max(0, roomsOnNight(type, night) - (taken.get(night) ?? 0)),
  }))
}

/** Rooms of this type still free on every night of the stay. */
export function roomsLeft(
  type: RoomTypeInventory,
  existing: readonly ExistingRoomBooking[],
  interval: { start: Date; end: Date },
  excludeBookingId?: number | string,
): number {
  const nights = nightlyFree(type, existing, interval, excludeBookingId)
  return nights.length === 0 ? 0 : Math.min(...nights.map((n) => n.free))
}

/** The options of a type that meet the filters; all of them when none is set. */
export function matchingOptions(type: RoomTypeInventory, filters: RoomFilters = {}): RoomOption[] {
  return type.options.filter(
    (option) =>
      (!filters.breakfast || option.breakfast === true) &&
      (!filters.freeCancellation || option.cancellation === 'free'),
  )
}

/**
 * Whether a room type meets a guest's filters.
 *
 * All the filters have to be met by the same room type, and breakfast and free
 * cancellation by the same option of it: a hotel with a sea-view room without
 * breakfast and a breakfast room facing the street is not a match for "sea
 * view with breakfast" (agreed 17 November 2026).
 */
export function typeMatches(type: RoomTypeInventory, filters: RoomFilters = {}): boolean {
  if (filters.view && !(type.views ?? []).includes(filters.view)) return false
  if (filters.kind && (type.kind ?? 'room') !== filters.kind) return false
  return matchingOptions(type, filters).length > 0
}

/**
 * Whether a hotel can take a party in some rooms of one type, for the
 * directory's "who has space". One type, because that is what a guest searching
 * "2 rooms for 4" books in the common case; a stay split across types is still
 * possible on the hotel's own page.
 */
export function hotelHasSpace(
  types: readonly RoomTypeInventory[],
  existing: readonly ExistingRoomBooking[],
  interval: { start: Date; end: Date },
  { guests, rooms }: { guests: number; rooms: number },
  filters: RoomFilters = {},
): boolean {
  const wanted = Math.max(1, Math.floor(rooms))
  return types.some(
    (type) =>
      type.active !== false &&
      typeMatches(type, filters) &&
      roomsLeft(type, existing, interval) >= wanted &&
      sleeps(type) * wanted >= guests,
  )
}

export interface RoomRequest {
  interval: { start: Date; end: Date }
  guests: number
  lines: RoomLine[]
  /** Set when a booking is being changed, so it does not compete with itself. */
  excludeBookingId?: number | string
}

/**
 * The whole verdict for a room booking.
 *
 * First the hotel's own rules, through checkAvailability, minus the parts a
 * hotel does not use: opening hours (a hotel has check-in times instead), the
 * listing's single capacity (the room types replace it) and its party limits
 * (the rooms' sleeps replace them). Then the rooms.
 */
export function checkRoomRequest({
  rules,
  closures,
  types,
  existing,
  request,
  now = new Date(),
}: {
  rules: BookingRules | null | undefined
  closures?: ClosedPeriod[] | null
  types: readonly RoomTypeInventory[]
  existing: readonly ExistingRoomBooking[]
  request: RoomRequest
  now?: Date
}): Availability {
  const general = checkAvailability({
    rules: {
      ...(rules ?? {}),
      // A room booking is counted in nights. A listing whose rules were set up
      // for sittings (a minimum of an hour, a maximum of a few) would refuse
      // every night as "too long", so shorter limits mean 1 to 30 nights.
      minDurationMinutes: nightsLimit(rules?.minDurationMinutes, MINUTES_PER_DAY),
      maxDurationMinutes: nightsLimit(rules?.maxDurationMinutes, MINUTES_PER_DAY * 30),
      capacity: Number.MAX_SAFE_INTEGER,
      minPartySize: 1,
      maxPartySize: 1000,
    },
    hours: null,
    closures,
    existing: [],
    request: { interval: request.interval, partySize: Math.max(1, Math.floor(request.guests)) },
    now,
  })
  if (!general.ok) return general

  const wanted = new Map<number, number>()
  for (const line of request.lines) {
    const count = Math.floor(line.count)
    if (!Number.isFinite(count) || count < 1) continue
    wanted.set(line.roomType, (wanted.get(line.roomType) ?? 0) + count)
  }
  const total = [...wanted.values()].reduce((sum, n) => sum + n, 0)
  if (total === 0) return { ok: false, reason: 'no-rooms-chosen' }
  if (total > MAX_ROOMS_PER_BOOKING) {
    return { ok: false, reason: 'rooms-full', detail: { max: MAX_ROOMS_PER_BOOKING } }
  }

  let capacity = 0
  for (const [typeId, count] of wanted) {
    const type = types.find((candidate) => candidate.id === typeId)
    if (!type || type.active === false) return { ok: false, reason: 'room-unknown' }
    for (const line of request.lines.filter((l) => l.roomType === typeId)) {
      if (line.option && !type.options.some((option) => option.id === line.option)) {
        return { ok: false, reason: 'room-unknown' }
      }
    }
    const left = roomsLeft(type, existing, request.interval, request.excludeBookingId)
    if (count > left) return { ok: false, reason: 'rooms-full', detail: { left } }
    capacity += sleeps(type) * count
  }

  if (Math.floor(request.guests) > capacity) {
    return { ok: false, reason: 'rooms-too-small', detail: { sleeps: capacity } }
  }

  return { ok: true }
}

/** The wording stored on a booking line for an option, in English for the venue. */
export function optionLabel(option: RoomOption | undefined): string {
  if (!option) return ''
  const parts = [
    option.breakfast ? 'Breakfast included' : 'Room only',
    option.cancellation === 'non-refundable'
      ? 'Non-refundable'
      : `Free cancellation${
          typeof option.freeCancellationDays === 'number' && option.freeCancellationDays > 0
            ? ` until ${option.freeCancellationDays} day${option.freeCancellationDays === 1 ? '' : 's'} before`
            : ''
        }`,
    option.payment === 'in-advance' ? 'Pay in advance' : 'Pay at the property',
  ]
  return parts.join(' · ')
}

/** "2 × Deluxe Twin, 1 × Executive Suite": the booking's rooms in one line. */
export function roomsSummary(
  lines: readonly { roomName?: string | null; count: number }[],
): string {
  return lines
    .filter((line) => line.count > 0)
    .map((line) => `${line.count} × ${line.roomName || 'Room'}`)
    .join(', ')
}
