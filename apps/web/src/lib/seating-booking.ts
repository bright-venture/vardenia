import { occupiesCapacity, overlaps } from '@vardenia/core/booking'
import { resolveSeatingArea, type SeatingArea, type SeatingAreaKey } from '@vardenia/core'
import {
  checkAvailability,
  type Availability,
  type AvailabilityRequest,
  type BookingRules,
  type ClosedPeriod,
  type ExistingBooking,
  type UnavailableReason,
} from './availability'
import type { OpeningHour } from './hours'

/**
 * A table booking at a restaurant with seating areas (Task 8, 20 November
 * 2026). See core/seating for the rules; this applies them with the general
 * availability check.
 *
 *  - No areas: exactly checkAvailability, every overlapping booking against
 *    the listing's capacity, as before.
 *  - Areas: the general reasons first (bookings off, too soon, closed day,
 *    closed, party size...), in the order they always come; then the area
 *    (required, must be one of the listing's); then capacity: the area's
 *    tables, counting only overlapping bookings of the same area. Bookings
 *    without an area (made before the listing had areas) count against no
 *    area.
 *
 * Advisory like checkAvailability. The guarantee is the database trigger,
 * and for area bookings also the lock hooks/guardBookingWrite takes before it
 * counts (lib/booking-lock).
 */

interface SeatingCheck {
  rules: BookingRules | null | undefined
  hours: OpeningHour[] | null | undefined
  closures?: ClosedPeriod[] | null
  existing: ExistingBooking[]
  areas: readonly SeatingArea[]
  request: AvailabilityRequest
  now?: Date
}

/** The bookings that hold a table in this area. */
const inArea = (existing: ExistingBooking[], key: SeatingAreaKey) =>
  existing.filter((booking) => booking.area === key)

export function checkSeatingRequest({
  area,
  ...check
}: SeatingCheck & { area: string | null | undefined }): Availability {
  const { rules, hours, closures, existing, areas, request, now } = check
  if (areas.length === 0) {
    return checkAvailability({ rules, hours, closures, existing, request, now })
  }

  const resolved = resolveSeatingArea(areas, area)
  if (!resolved.ok) {
    // A closed day or a party too big is the answer whichever area is picked.
    const general = checkAvailability({ rules, hours, closures, existing: [], request, now })
    return general.ok ? { ok: false, reason: resolved.reason } : general
  }

  const chosen = resolved.area!
  return checkAvailability({
    rules: { ...(rules ?? {}), capacity: chosen.tables },
    hours,
    closures,
    existing: inArea(existing, chosen.key),
    request,
    now,
  })
}

export interface AreaAvailability {
  area: SeatingAreaKey
  setting: SeatingArea['setting']
  smoking: boolean
  label: string | null
  /** The area's tables: how many bookings may overlap in it. */
  capacity: number
  /** Occupying bookings of this area overlapping the requested time. */
  taken: number
  ok: boolean
  reason?: UnavailableReason
}

/** Every area of the listing, judged for the requested time. */
export function areaAvailability(check: SeatingCheck): AreaAvailability[] {
  return check.areas.map((area) => {
    const verdict = checkSeatingRequest({ ...check, area: area.key })
    const taken = inArea(check.existing, area.key).filter(
      (booking) =>
        booking.id !== check.request.excludeBookingId &&
        occupiesCapacity(booking.status) &&
        overlaps(check.request.interval, { start: booking.start, end: booking.end }),
    ).length
    return {
      area: area.key,
      setting: area.setting,
      smoking: area.smoking,
      label: area.label,
      capacity: area.tables,
      taken,
      ok: verdict.ok,
      ...(verdict.ok ? {} : { reason: verdict.reason }),
    }
  })
}

/**
 * One verdict for a listing with areas when no area is named (the trip
 * planner, the availability route without `area`): free when any area is,
 * otherwise the first area's reason (the general reasons are the same for
 * every area; when they all pass, it is 'at-capacity').
 */
export function anyAreaVerdict(check: SeatingCheck): Availability {
  let first: Availability | null = null
  for (const area of check.areas) {
    const verdict = checkSeatingRequest({ ...check, area: area.key })
    if (verdict.ok) return verdict
    first ??= verdict
  }
  return first ?? checkAvailability(check)
}
