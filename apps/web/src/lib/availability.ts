import {
  durationMinutes,
  isUsableInterval,
  occupiesCapacity,
  overlaps,
  type BookingStatus,
  type Interval,
} from '@vardenia/core'
import { isOpenNow, type OpeningHour } from './hours'

/**
 * Can this booking be made?
 *
 * A pure function of the request, the business's rules, its opening hours and
 * the bookings that already exist. No database, no clock of its own - `now` is
 * passed in. That is what makes the awkward cases testable: a request for 03:00
 * on a Sunday at a restaurant whose Saturday session runs past midnight, a
 * booking made eleven months out, a party of twelve at a place that seats four.
 *
 * # This is advisory, not the guarantee
 *
 * Capacity is checked here so the customer gets a useful message, and it is
 * checked *again* by a trigger in the database, which is where the guarantee
 * actually lives. Two people booking the last table at the same moment both pass
 * this function: it reads the bookings that existed when it ran, and neither
 * request has been written yet. No amount of care in application code fixes
 * that, because the check and the insert are separate statements.
 *
 * So treat a pass here as "worth submitting", never as "reserved".
 */

export const UNAVAILABLE_REASONS = [
  'invalid-interval',
  'bookings-disabled',
  'in-the-past',
  'too-soon',
  'too-far-ahead',
  'too-short',
  'too-long',
  'party-too-small',
  'party-too-large',
  'closed',
  'at-capacity',
] as const

export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number]

export type Availability =
  { ok: true } | { ok: false; reason: UnavailableReason; detail?: Record<string, number> }

/**
 * Per-business booking rules, as stored on the listing.
 *
 * Every field is optional because Payload returns a group that nobody has filled
 * in as `undefined`, and a half-configured listing must not resolve to something
 * permissive. Missing values fall back to the constants below, except `enabled`,
 * which falls back to off.
 */
export interface BookingRules {
  enabled?: boolean | null
  /** How many occupying bookings may overlap at once. */
  capacity?: number | null
  minPartySize?: number | null
  maxPartySize?: number | null
  /** Minimum notice, in minutes. A kitchen needs some; a hotel needs more. */
  leadTimeMinutes?: number | null
  /** How far ahead the calendar is open, in days. */
  maxAdvanceDays?: number | null
  minDurationMinutes?: number | null
  maxDurationMinutes?: number | null
}

/** An existing booking, reduced to what the check actually needs. */
export interface ExistingBooking {
  start: Date
  end: Date
  status: BookingStatus
  /** Excluded from the capacity count, so editing a booking does not conflict with itself. */
  id?: string | number
}

export interface AvailabilityRequest {
  interval: Interval
  partySize: number
  /** Set when editing, so the booking being changed is not counted against itself. */
  excludeBookingId?: string | number
}

const DEFAULTS = {
  capacity: 1,
  minPartySize: 1,
  maxPartySize: 20,
  leadTimeMinutes: 0,
  maxAdvanceDays: 365,
  minDurationMinutes: 15,
  maxDurationMinutes: 60 * 24 * 30,
} as const

/** A positive integer, or the fallback. Guards against 0, NaN and negatives in the CMS. */
const positive = (value: number | null | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback

/** Zero is meaningful for lead time, so it needs its own guard. */
const nonNegative = (value: number | null | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback

export function resolveRules(rules: BookingRules | null | undefined) {
  const r = rules ?? {}
  return {
    enabled: r.enabled === true,
    capacity: positive(r.capacity, DEFAULTS.capacity),
    minPartySize: positive(r.minPartySize, DEFAULTS.minPartySize),
    maxPartySize: positive(r.maxPartySize, DEFAULTS.maxPartySize),
    leadTimeMinutes: nonNegative(r.leadTimeMinutes, DEFAULTS.leadTimeMinutes),
    maxAdvanceDays: positive(r.maxAdvanceDays, DEFAULTS.maxAdvanceDays),
    minDurationMinutes: positive(r.minDurationMinutes, DEFAULTS.minDurationMinutes),
    maxDurationMinutes: positive(r.maxDurationMinutes, DEFAULTS.maxDurationMinutes),
  }
}

export function checkAvailability({
  rules,
  hours,
  existing,
  request,
  now = new Date(),
}: {
  rules: BookingRules | null | undefined
  hours: OpeningHour[] | null | undefined
  existing: ExistingBooking[]
  request: AvailabilityRequest
  now?: Date
}): Availability {
  const config = resolveRules(rules)

  // Ordered cheapest first, and deliberately from the most general reason to the
  // most specific: telling someone the restaurant is full is worse than useless
  // if the real problem is that it does not take bookings at all.
  if (!config.enabled) return { ok: false, reason: 'bookings-disabled' }

  if (!isUsableInterval(request.interval)) return { ok: false, reason: 'invalid-interval' }

  const minutes = durationMinutes(request.interval)!
  const { start } = request.interval

  if (start.getTime() < now.getTime()) return { ok: false, reason: 'in-the-past' }

  const noticeMinutes = (start.getTime() - now.getTime()) / 60_000
  if (noticeMinutes < config.leadTimeMinutes) {
    return {
      ok: false,
      reason: 'too-soon',
      detail: { requiredMinutes: config.leadTimeMinutes },
    }
  }

  const daysAhead = (start.getTime() - now.getTime()) / 86_400_000
  if (daysAhead > config.maxAdvanceDays) {
    return { ok: false, reason: 'too-far-ahead', detail: { maxDays: config.maxAdvanceDays } }
  }

  if (minutes < config.minDurationMinutes) {
    return { ok: false, reason: 'too-short', detail: { minMinutes: config.minDurationMinutes } }
  }
  if (minutes > config.maxDurationMinutes) {
    return { ok: false, reason: 'too-long', detail: { maxMinutes: config.maxDurationMinutes } }
  }

  const party = Math.floor(request.partySize)
  if (!Number.isFinite(party) || party < config.minPartySize) {
    return { ok: false, reason: 'party-too-small', detail: { minPartySize: config.minPartySize } }
  }
  if (party > config.maxPartySize) {
    return { ok: false, reason: 'party-too-large', detail: { maxPartySize: config.maxPartySize } }
  }

  /**
   * Opening hours, checked at the start instant only.
   *
   * `isOpenNow` already knows about Beirut and about sessions that run past
   * midnight, so this reuses it rather than reimplementing a timezone.
   *
   * Only the start is checked, and that is a decision rather than an oversight.
   * A dinner booked at 21:00 in a kitchen that closes at 23:00 legitimately runs
   * past closing while the guests finish, and a hotel stay spans every closed
   * night in between. Requiring the end to fall inside opening hours would
   * reject both.
   *
   * `null` means no hours are recorded, which is not the same as closed. A
   * business with bookings switched on and no hours published is taken at its
   * word - the alternative is refusing every request at a place that has told us
   * it wants them.
   */
  if (isOpenNow(hours, start) === false) return { ok: false, reason: 'closed' }

  const conflicting = existing.filter((booking) => {
    if (request.excludeBookingId !== undefined && booking.id === request.excludeBookingId) {
      return false
    }
    if (!occupiesCapacity(booking.status)) return false
    return overlaps(request.interval, { start: booking.start, end: booking.end })
  })

  if (conflicting.length >= config.capacity) {
    return {
      ok: false,
      reason: 'at-capacity',
      detail: { capacity: config.capacity, taken: conflicting.length },
    }
  }

  return { ok: true }
}

/**
 * Wording for a customer, in both languages.
 *
 * Kept beside the reasons so adding one to `UNAVAILABLE_REASONS` without a
 * message fails to compile rather than rendering a blank.
 */
const MESSAGES: Record<UnavailableReason, { en: string; ar: string }> = {
  'invalid-interval': {
    en: 'Those dates do not make sense. Please check them and try again.',
    ar: 'التواريخ غير صحيحة. يرجى التحقق منها والمحاولة مرة أخرى.',
  },
  'bookings-disabled': {
    en: 'This place does not take bookings through Vardenia yet.',
    ar: 'هذا المكان لا يستقبل الحجوزات عبر فاردينيا بعد.',
  },
  'in-the-past': {
    en: 'That time has already passed.',
    ar: 'لقد مضى هذا الوقت.',
  },
  'too-soon': {
    en: 'This place needs more notice than that.',
    ar: 'يحتاج هذا المكان إلى مهلة أطول.',
  },
  'too-far-ahead': {
    en: 'Bookings are not open that far ahead yet.',
    ar: 'الحجوزات غير متاحة لهذه الفترة بعد.',
  },
  'too-short': {
    en: 'That booking is too short.',
    ar: 'مدة الحجز قصيرة جدًا.',
  },
  'too-long': {
    en: 'That booking is too long.',
    ar: 'مدة الحجز طويلة جدًا.',
  },
  'party-too-small': {
    en: 'Please enter how many people are coming.',
    ar: 'يرجى إدخال عدد الأشخاص.',
  },
  'party-too-large': {
    en: 'That is more people than this place can take at once.',
    ar: 'هذا العدد أكبر مما يمكن لهذا المكان استقباله في وقت واحد.',
  },
  closed: {
    en: 'This place is closed at that time.',
    ar: 'هذا المكان مغلق في ذلك الوقت.',
  },
  'at-capacity': {
    en: 'This place is fully booked at that time.',
    ar: 'هذا المكان محجوز بالكامل في ذلك الوقت.',
  },
}

export function unavailableMessage(reason: UnavailableReason, locale: 'en' | 'ar' = 'en'): string {
  return MESSAGES[reason][locale === 'ar' ? 'ar' : 'en']
}
