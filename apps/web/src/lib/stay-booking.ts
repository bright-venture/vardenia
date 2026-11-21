import type { Payload, PayloadRequest } from 'payload'
import {
  isWholePropertyStay,
  stayLimitProblem,
  stayMaxGuests,
  stayMinNights,
  type StayConfig,
} from '@vardenia/core'
import {
  checkAvailability,
  type Availability,
  type BookingRules,
  type ClosedPeriod,
  type ExistingBooking,
} from './availability'
import { roomStayInterval, stayNights } from './room-availability'
import { beirutDate } from './beirut'

/**
 * Booking a guest house as a whole property (Task 6, 20 November 2026).
 *
 * A getaway is not a hotel with rooms: the guest takes the whole place for some
 * nights. So, whatever the listing's booking rules say:
 *
 *  - **One stay at a time.** Capacity is 1. `checkAvailability` counts the
 *    overlapping stays with the same half-open rule as every booking, and the
 *    database trigger enforces the listing's `booking_capacity`, which the
 *    Businesses validation keeps at 1 for a getaway (fields/bookingRules).
 *  - **Nights, from check-in to check-out.** The stay runs from the listing's
 *    check-in time on the first day to its check-out time after the last night
 *    (15:00 and 11:00 unless set), the interval a hotel room uses, so one stay
 *    leaving at 11:00 and the next arriving at 15:00 never meet.
 *  - **The owner's limits.** At least `stay.minNights` nights, at most
 *    `stay.maxGuests` guests (counted as core/stay counts them). The staff
 *    party-size limits are not used: the owner's guest cap replaces them, as a
 *    room's sleeps does at a hotel. Opening hours are not used either: a guest
 *    house has check-in times.
 *
 * Everything else (booking switched on, notice, how far ahead, closed dates) is
 * the listing's ordinary rules, read through checkAvailability.
 */

const MINUTES_PER_DAY = 1440

/** A duration rule kept only when it is already in whole days. */
const nightsLimit = (value: number | null | undefined, fallback: number): number =>
  typeof value === 'number' && value >= MINUTES_PER_DAY ? value : fallback

/** The listing's rules as they apply to a whole-property stay. */
export function wholePropertyRules(rules: BookingRules | null | undefined): BookingRules {
  return {
    ...(rules ?? {}),
    capacity: 1,
    minDurationMinutes: nightsLimit(rules?.minDurationMinutes, MINUTES_PER_DAY),
    maxDurationMinutes: nightsLimit(rules?.maxDurationMinutes, MINUTES_PER_DAY * 30),
    minPartySize: 1,
    // The schema's own ceiling; the owner's guest cap is checked separately.
    maxPartySize: 500,
  }
}

/**
 * The same rules for the Book form: nights from the owner's minimum, and the
 * guest cap as the largest party it offers (20 when there is none, the form's
 * usual default).
 */
export function stayFormRules(
  rules: BookingRules | null | undefined,
  stay: StayConfig | null | undefined,
): BookingRules {
  const base = wholePropertyRules(rules)
  const minNights = stayMinNights(stay)
  return {
    ...base,
    minDurationMinutes: Math.max(
      base.minDurationMinutes ?? MINUTES_PER_DAY,
      minNights * MINUTES_PER_DAY,
    ),
    maxPartySize: stayMaxGuests(stay) ?? 20,
  }
}

/**
 * The interval a stay holds: check-in on the first Beirut day to check-out
 * after the nights, whatever times the request carried.
 */
export function stayInterval(
  start: Date,
  end: Date,
  rules: BookingRules | null | undefined,
): { start: Date; end: Date } | null {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return roomStayInterval(beirutDate(start), stayNights(start, end).length, rules)
}

export interface StayRequest {
  interval: { start: Date; end: Date }
  adults: number
  children?: number
  /** Set when a booking is being moved, so it does not compete with itself. */
  excludeBookingId?: string | number
}

/**
 * The whole verdict for a guest house stay. Pure, like checkAvailability.
 *
 * Order: the listing's general rules first (so "does not take bookings" beats
 * everything), then the owner's minimum nights and guest cap, then whether the
 * property is free.
 */
export function checkStayRequest({
  rules,
  closures,
  existing,
  stay,
  request,
  now = new Date(),
}: {
  rules: BookingRules | null | undefined
  closures?: ClosedPeriod[] | null
  existing: ExistingBooking[]
  stay: StayConfig | null | undefined
  request: StayRequest
  now?: Date
}): Availability {
  const config = wholePropertyRules(rules)
  const adults = Math.max(0, Math.floor(request.adults))
  const children = Math.max(0, Math.floor(request.children ?? 0))
  const availabilityRequest = {
    interval: request.interval,
    partySize: Math.max(1, adults + children),
    ...(request.excludeBookingId !== undefined
      ? { excludeBookingId: request.excludeBookingId }
      : {}),
  }

  const general = checkAvailability({
    rules: config,
    hours: null,
    closures,
    existing: [],
    request: availabilityRequest,
    now,
  })
  if (!general.ok) return general

  const nights = stayNights(request.interval.start, request.interval.end).length
  const limit = stayLimitProblem({ nights, adults, children, stay })
  if (limit === 'below-min-nights') {
    return { ok: false, reason: 'below-min-nights', detail: { minNights: stayMinNights(stay) } }
  }
  if (limit === 'above-max-guests') {
    return {
      ok: false,
      reason: 'party-too-large',
      detail: { maxPartySize: stayMaxGuests(stay) ?? 0 },
    }
  }

  // The property itself: capacity 1, the half-open overlap of checkAvailability.
  return checkAvailability({
    rules: config,
    hours: null,
    closures,
    existing,
    request: availabilityRequest,
    now,
  })
}

/** Whether a listing document is booked as a whole property. */
export const isWholeProperty = (business: unknown): boolean =>
  isWholePropertyStay((business as { subcategories?: string[] | null } | null)?.subcategories)

/**
 * The stay config of a listing: its `stay` group when it is a guest house,
 * null for every other kind (whatever stale values the group might hold).
 */
export function stayConfigOf(business: unknown): StayConfig | null {
  if (!business || !isWholeProperty(business)) return null
  const stay = (business as { stay?: unknown }).stay
  return stay && typeof stay === 'object' ? (stay as StayConfig) : {}
}

/**
 * Load what a guest house booking is judged and priced against: whether the
 * listing is booked whole, its booking rules and its stay config. Read with
 * access overridden, as the booking service reads the listing. Null when the
 * listing does not exist. For Task 7, which quotes the stay (core quoteStay)
 * from `stay`.
 */
export async function loadStayConfig(
  payload: Payload,
  businessId: number | string,
  { req, locale }: { req?: PayloadRequest; locale?: string } = {},
): Promise<{
  wholeProperty: boolean
  rules: BookingRules | null
  stay: StayConfig | null
} | null> {
  const business = await payload
    .findByID({
      collection: 'businesses',
      id: businessId,
      depth: 0,
      overrideAccess: true,
      ...(req ? { req } : {}),
      ...(locale ? { locale: locale as never } : {}),
    })
    .catch(() => null)
  if (!business) return null
  const wholeProperty = isWholeProperty(business)
  return {
    wholeProperty,
    rules: wholeProperty
      ? (((business as { booking?: unknown }).booking as BookingRules | undefined) ?? null)
      : null,
    stay: stayConfigOf(business),
  }
}
