import { dataLocale, type Locale } from '@vardenia/i18n'
import { isCalendarDay } from './availability'
import { addDays } from './beirut'
import { bookingFormModel, toInterval, type BookingFormModel } from './booking-form'
import type { BookingRules } from './availability'

/**
 * A guest's plans: the day, the time or the nights, and how many are coming.
 *
 * Chosen once, on the directory or a section page, and then carried: through
 * the filters and the page numbers, onto every card's link, and into the Book
 * form on the listing, which arrives filled in. Booking.com's search does the
 * same, and it is the difference between choosing a date once and choosing it
 * again on every place a guest opens.
 *
 * # In the URL, and nowhere else
 *
 * `?date=2026-10-03&time=20:00&party=4`. Like every filter on the directory, a
 * set of plans is an address that can be shared, reloaded and sent to whoever
 * else is coming. Nothing is remembered in a cookie: the listing pages are
 * prerendered, and a cookie read on the server would make every one of them
 * dynamic. The Book form reads the query string in the browser instead.
 *
 * # Parsed, not trusted
 *
 * Anything that does not look like a plan is dropped rather than guessed at, the
 * same rule as the directory filters. A plan with no valid date is no plan at
 * all: the time and party only mean something on a day.
 *
 * Client-safe: the Book form uses it in the browser.
 */

export interface Trip {
  /** "YYYY-MM-DD", a Beirut calendar day. */
  date: string
  /** "HH:MM" for a table, or null when not given (see TRIP_DEFAULT_TIME). */
  time: string | null
  /** For a stay. 1 when not given. */
  nights: number
  party: number
}

/** The query string as it arrives. */
export interface RawTripParams {
  date?: string
  time?: string
  nights?: string
  party?: string
}

/** A table for dinner, when a guest gave a day and no time. */
export const TRIP_DEFAULT_TIME = '20:00'
export const TRIP_DEFAULT_PARTY = 2
export const TRIP_MAX_PARTY = 50
export const TRIP_MAX_NIGHTS = 30
/** How far ahead a plan may be, matching the longest calendar a listing can open. */
export const TRIP_MAX_DAYS_AHEAD = 365

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** A whole number within bounds, or null. "4" yes; "4.5", "-1", "four" no. */
function wholeNumber(raw: string | undefined, min: number, max: number): number | null {
  if (!raw || !/^\d{1,3}$/.test(raw)) return null
  const value = Number(raw)
  return value >= min && value <= max ? value : null
}

/**
 * The plans in a query string, or null when there are none.
 *
 * `today` is the Beirut day: a date before it, or more than a year after it, is
 * dropped. Past it the plan could never be booked anywhere, and every result
 * would say so. Left out, no bound is applied, which is what the browser does
 * (the Book form checks against its own earliest date).
 */
export function parseTrip(raw: RawTripParams, today?: string): Trip | null {
  const date = raw.date
  if (!isCalendarDay(date)) return null
  if (today && (date < today || date > addDays(today, TRIP_MAX_DAYS_AHEAD))) return null

  return {
    date,
    time: raw.time && TIME.test(raw.time) ? raw.time : null,
    nights: wholeNumber(raw.nights, 1, TRIP_MAX_NIGHTS) ?? 1,
    party: wholeNumber(raw.party, 1, TRIP_MAX_PARTY) ?? TRIP_DEFAULT_PARTY,
  }
}

/**
 * The plans as query parameters, in a fixed order.
 *
 * Fixed so two routes to the same view build the same string (the same reason
 * as filterHref). One night is the default, so it is left out: a table
 * booking's link does not need to say "for one night".
 */
export function tripParams(trip: Trip | null | undefined): [string, string][] {
  if (!trip) return []
  const out: [string, string][] = [['date', trip.date]]
  if (trip.time) out.push(['time', trip.time])
  if (trip.nights !== 1) out.push(['nights', String(trip.nights)])
  out.push(['party', String(trip.party)])
  return out
}

/** The same, as an object for a `Link` href's `query`. */
export function tripQuery(trip: Trip | null | undefined): Record<string, string> {
  return Object.fromEntries(tripParams(trip))
}

/**
 * The interval a plan asks one listing for, and the form shape that decided it.
 *
 * The same builder the Book form uses, so the directory checks exactly what the
 * form would send: a stay from check-in on the day for the chosen nights, and a
 * table at the chosen time (20:00 when none was given) for the listing's
 * shortest sitting.
 */
export function tripInterval(
  trip: Trip,
  rules: BookingRules | null | undefined,
  now?: Date,
): { start: Date; end: Date; model: BookingFormModel } | null {
  const model = bookingFormModel(rules, now)
  const interval =
    model.mode === 'nights'
      ? toInterval({ mode: 'nights', date: trip.date, nights: trip.nights })
      : toInterval({
          mode: 'sitting',
          date: trip.date,
          time: trip.time ?? TRIP_DEFAULT_TIME,
          durationMinutes: model.durationOptions[0],
        })
  if (!interval) return null
  return { start: new Date(interval.start), end: new Date(interval.end), model }
}

/** "Sat 3 Oct": short enough for a card, with the weekday people plan by. */
export function tripDayLabel(date: string, locale: Locale): string {
  const instant = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(instant.getTime())) return date
  return new Intl.DateTimeFormat(dataLocale(locale), {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(instant)
}

/**
 * What the Book form should start with, given a plan.
 *
 * The plan fills in what it can and the form's own defaults cover the rest:
 *
 * - the date, unless it falls outside the days this listing takes (a plan
 *   carried to a place that needs a week's notice should not arrive as a date
 *   the picker cannot show);
 * - the time, for a table;
 * - the nights, when the listing offers that many, else the nearest it does;
 * - the party as the guest gave it, even beyond this listing's limit. Quietly
 *   changing "6" to "4" would book the wrong table; leaving it lets the form
 *   say this place takes up to four.
 */
export function prefillFromTrip(
  model: BookingFormModel,
  trip: Trip | null,
): { date: string; time: string; nights: number; partySize: number } {
  const defaults = {
    date: model.earliestDate,
    time: TRIP_DEFAULT_TIME,
    nights: model.nightOptions[0] ?? 1,
    partySize: model.defaultPartySize,
  }
  if (!trip) return defaults

  const inRange = trip.date >= model.earliestDate && trip.date <= model.latestDate
  const nights =
    model.nightOptions.length === 0
      ? defaults.nights
      : model.nightOptions.includes(trip.nights)
        ? trip.nights
        : // The longest stay offered that is not longer than asked, else the shortest.
          ([...model.nightOptions].reverse().find((n) => n <= trip.nights) ?? defaults.nights)

  return {
    date: inRange ? trip.date : defaults.date,
    time: trip.time ?? defaults.time,
    nights,
    partySize: trip.party,
  }
}
