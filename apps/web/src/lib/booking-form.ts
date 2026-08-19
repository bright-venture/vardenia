import { resolveRules, type BookingRules } from './availability'
import { addDays, beirutDate, beirutInstant } from './beirut'

/**
 * What the booking form should look like for a given listing.
 *
 * The rules on a listing describe a restaurant and a hotel with the same seven
 * numbers, so the form has to read them and decide what it is asking for. A
 * pure function, separate from the component, because every interesting case
 * here is a number in the CMS rather than a click: a venue whose minimum
 * duration is 24 hours, one whose lead time pushes the first bookable day into
 * next week, one whose maximum party is smaller than its minimum because
 * somebody typed the fields the wrong way round.
 *
 * # Two shapes, one set of rules
 *
 * `minDurationMinutes >= 1440` means the shortest thing this place sells is a
 * whole day, so it is asking for nights, not for a sitting time. A hotel form
 * with a "20:00" field and a "2 hours" dropdown is not a subtle problem - it is
 * unusable - and a restaurant form asking for a number of nights is the same
 * mistake pointing the other way.
 *
 * The threshold is the boundary the data already draws. Nothing in the CMS says
 * "this is a hotel", and adding a field to say so would be a second source of
 * truth that can disagree with the durations right next to it.
 */

export type BookingMode = 'nights' | 'sitting'

export interface BookingFormModel {
  mode: BookingMode
  /** Earliest date the customer may pick, "YYYY-MM-DD" in Beirut. */
  earliestDate: string
  /** Latest date, from `maxAdvanceDays`. */
  latestDate: string
  minPartySize: number
  maxPartySize: number
  defaultPartySize: number
  /** Selectable durations in minutes, longest run capped. Sitting mode. */
  durationOptions: number[]
  /** Selectable stay lengths in nights. Nights mode. */
  nightOptions: number[]
  /** Minimum notice in minutes, for wording rather than for validation. */
  leadTimeMinutes: number
}

const MINUTES_PER_DAY = 1440

/** How many choices a dropdown may offer before it stops being a choice. */
const MAX_OPTIONS = 12

/**
 * Durations from the minimum upwards, in steps that read like a booking.
 *
 * The minimum, then every half hour *on* the half hour above it, then the
 * maximum if the grid missed it.
 *
 * Two rules were tried before this one and both produced lists a customer would
 * have to work around. Stepping by the minimum turns a 90-minute sitting into
 * 90, 180, 240 - no two hours, which is the most common dinner there is.
 * Stepping by 30 *from* the minimum turns a 15-minute one into 15, 45, 75, 105,
 * a column of numbers nobody thinks in. Snapping to the grid gives 15, 30, 60,
 * 90, 120 and 90, 120, 150, 180, 210, 240, which are the lists somebody would
 * have written by hand.
 */
export function durationChoices(minMinutes: number, maxMinutes: number): number[] {
  if (maxMinutes < minMinutes) return [minMinutes]

  const step = 30
  const out: number[] = [minMinutes]

  // The first half hour strictly above the minimum. Strictly, so a minimum that
  // is already on the grid is not offered twice.
  let value = Math.floor(minMinutes / step) * step + step
  for (; value <= maxMinutes && out.length < MAX_OPTIONS; value += step) out.push(value)

  // A maximum that is not on the grid lands nowhere, and it is the one value a
  // customer is most likely to want at a place that sells a fixed session.
  const last = out[out.length - 1]
  if (last !== undefined && last < maxMinutes && out.length < MAX_OPTIONS) out.push(maxMinutes)

  return out
}

/** Whole nights between the minimum and maximum duration. */
export function nightChoices(minMinutes: number, maxMinutes: number): number[] {
  const min = Math.max(1, Math.round(minMinutes / MINUTES_PER_DAY))
  const max = Math.max(min, Math.floor(maxMinutes / MINUTES_PER_DAY))

  const out: number[] = []
  for (let n = min; n <= max && out.length < MAX_OPTIONS; n++) out.push(n)
  return out
}

export function bookingFormModel(
  rules: BookingRules | null | undefined,
  now: Date = new Date(),
): BookingFormModel {
  const config = resolveRules(rules)
  const mode: BookingMode = config.minDurationMinutes >= MINUTES_PER_DAY ? 'nights' : 'sitting'

  /**
   * The first bookable day, not simply today.
   *
   * A venue wanting three days' notice should not offer tomorrow and then refuse
   * it. Rounded up to whole days because this is a date picker: an eighteen-hour
   * lead time at 20:00 rules out tomorrow morning but not tomorrow evening, and
   * a date field cannot express that - so the day stays available and
   * `checkAvailability` refuses the specific time if it is still too soon.
   */
  const leadDays = Math.floor(config.leadTimeMinutes / MINUTES_PER_DAY)
  const today = beirutDate(now)

  /**
   * Both bounds can be wrong in the CMS, and they are swapped rather than
   * trusted. A form whose minimum exceeds its maximum renders a party-size field
   * with no valid value in it, and the customer has no way to know why.
   */
  const minParty = Math.min(config.minPartySize, config.maxPartySize)
  const maxParty = Math.max(config.minPartySize, config.maxPartySize)

  return {
    mode,
    earliestDate: addDays(today, leadDays),
    latestDate: addDays(today, config.maxAdvanceDays),
    minPartySize: minParty,
    maxPartySize: maxParty,
    defaultPartySize: Math.min(Math.max(2, minParty), maxParty),
    durationOptions:
      mode === 'sitting'
        ? durationChoices(config.minDurationMinutes, config.maxDurationMinutes)
        : [],
    nightOptions:
      mode === 'nights' ? nightChoices(config.minDurationMinutes, config.maxDurationMinutes) : [],
    leadTimeMinutes: config.leadTimeMinutes,
  }
}

/**
 * Check-in and check-out times for a stay, when the form asks for nights.
 *
 * Fixed rather than asked. Nobody books a hotel by choosing 15:00 from a
 * dropdown, and the numbers are the ones most Lebanese hotels print on the
 * booking confirmation anyway. When a listing needs its own, they become two
 * more fields on the booking group - this is the default, not a constant of
 * nature.
 */
export const CHECK_IN = '15:00'
export const CHECK_OUT = '11:00'

export interface IntervalInput {
  mode: BookingMode
  /** "YYYY-MM-DD" as picked, read as a Beirut calendar date. */
  date: string
  /** "HH:MM". Sitting mode only. */
  time?: string
  /** Sitting mode. */
  durationMinutes?: number
  /** Nights mode. */
  nights?: number
}

/**
 * The half-open interval a form's answers describe.
 *
 * Half-open is the whole model - see packages/core - so a two-night stay is
 * [check-in on day 1, check-out on day 3) and back-to-back stays do not collide
 * on the changeover day.
 *
 * Returns null for anything it cannot build. The endpoint validates again and is
 * the authority; this exists so the form can refuse before a round trip rather
 * than to be trusted.
 */
export function toInterval(input: IntervalInput): { start: string; end: string } | null {
  if (input.mode === 'nights') {
    const nights = Math.floor(input.nights ?? 0)
    if (!Number.isFinite(nights) || nights < 1) return null

    const start = beirutInstant(input.date, CHECK_IN)
    const end = beirutInstant(addDays(input.date, nights), CHECK_OUT)
    if (!start || !end) return null

    return { start: start.toISOString(), end: end.toISOString() }
  }

  const minutes = Math.floor(input.durationMinutes ?? 0)
  if (!Number.isFinite(minutes) || minutes < 1) return null

  const start = beirutInstant(input.date, input.time ?? '')
  if (!start) return null

  /**
   * The end is the start plus a duration in real elapsed time, which is right
   * even across a clock change: a two-hour dinner is two hours long on the night
   * the clocks go forward too. It is only the *start* that had to be pinned to
   * Beirut's wall clock.
   */
  const end = new Date(start.getTime() + minutes * 60_000)

  return { start: start.toISOString(), end: end.toISOString() }
}

/** "2 hours", "1 hour 30 minutes", "3 nights" - for a dropdown label. */
export function durationLabel(minutes: number, locale: 'en' | 'ar' = 'en'): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  if (locale === 'ar') {
    const h = hours === 0 ? '' : hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتان' : `${hours} ساعات`
    const m = rest === 0 ? '' : `${rest} دقيقة`
    return [h, m].filter(Boolean).join(' و') || `${minutes} دقيقة`
  }

  const h = hours === 0 ? '' : hours === 1 ? '1 hour' : `${hours} hours`
  const m = rest === 0 ? '' : `${rest} minutes`
  return [h, m].filter(Boolean).join(' ') || `${minutes} minutes`
}
