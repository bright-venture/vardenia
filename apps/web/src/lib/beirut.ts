/**
 * Wall-clock time in Beirut, converted to an instant.
 *
 * A booking form collects "1 September, 20:00". That is a time in Beirut,
 * because it is a table in Beirut - not a time in whatever timezone the person
 * booking happens to be sitting in. `new Date('2026-09-01T20:00')` reads it in
 * the *browser's* zone, so a customer booking from Paris would ask for 21:00
 * Beirut and a customer in Dubai for 19:00, and neither would be told.
 *
 * That is not a rounding error. `checkAvailability` compares the start against
 * opening hours evaluated in Beirut (see lib/hours), so an hour of drift turns
 * "open" into "closed at that time" for a form the customer filled in
 * correctly - and, worse, the other direction: a booking accepted for a kitchen
 * that has gone home.
 *
 * # How the offset is found
 *
 * There is no built-in "parse this wall-clock time in that zone". The standard
 * approach is to guess an instant, ask what Beirut's clock said at that instant,
 * and correct by the difference. One correction is enough except within an hour
 * of a DST transition, where the first guess can land on the wrong side of the
 * jump, so the offset is taken a second time at the corrected instant.
 *
 * Lebanon does still change its clocks, and did so at four days' notice in 2023
 * with two effective timezones in the country for a week. This is not a
 * hypothetical the code can be careless about.
 *
 * Kept separate from lib/hours, which answers "is it open now" and needs only
 * the current time. Both name the zone; that duplication is deliberate, since
 * merging them would put date arithmetic inside the opening-hours module for no
 * reason other than sharing one string.
 */

const BEIRUT = 'Asia/Beirut'

/** Formatter reused across calls. Constructing one per call is the slow path. */
const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: BEIRUT,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** What Beirut's clock read at this instant, as UTC-shaped milliseconds. */
function beirutClockAsUtc(instant: Date): number {
  const parts = PARTS.formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)

  // `hour12: false` yields 24 rather than 0 for midnight in some engines.
  const hour = get('hour') % 24

  return Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
}

/**
 * Beirut's offset from UTC in milliseconds at a given instant.
 *
 * Positive, because Beirut is ahead: +2h in winter, +3h in summer.
 */
export function beirutOffset(instant: Date): number {
  return beirutClockAsUtc(instant) - instant.getTime()
}

/** "YYYY-MM-DD" and "HH:MM" split into numbers, or null if either is malformed. */
function parseWallClock(date: string, time: string) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim())
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!d || !t) return null

  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])]
  const [hour, minute] = [Number(t[1]), Number(t[2])]

  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (hour > 23 || minute > 59) return null

  return { year, month, day, hour, minute }
}

/**
 * The instant at which Beirut's clock reads this date and time.
 *
 * Returns null rather than an approximate Date for input it cannot parse. A
 * booking placed at a guessed time is worse than a booking refused.
 */
export function beirutInstant(date: string, time: string): Date | null {
  const parsed = parseWallClock(date, time)
  if (!parsed) return null

  const { year, month, day, hour, minute } = parsed
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute)

  // First guess: treat the wall clock as UTC, then subtract the offset that
  // applied around then.
  const guess = new Date(asIfUtc - beirutOffset(new Date(asIfUtc)))

  // Second pass, which only changes anything near a DST transition - where the
  // offset at the guessed instant differs from the offset at the real one.
  const corrected = new Date(asIfUtc - beirutOffset(guess))

  return Number.isNaN(corrected.getTime()) ? null : corrected
}

/** Today's date in Beirut as "YYYY-MM-DD". */
export function beirutDate(instant: Date = new Date()): string {
  const parts = PARTS.formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * A calendar date shifted by whole days, staying a calendar date.
 *
 * Done in UTC on purpose. Adding 86,400,000ms to an instant crosses a DST
 * boundary badly - the clock moves and "tomorrow" becomes today at 23:00 - but
 * the *calendar* has no such problem: the day after 2026-03-28 is 2026-03-29
 * whatever the clocks do in between.
 */
export function addDays(date: string, days: number): string {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim())
  if (!parsed) return date

  const shifted = new Date(
    Date.UTC(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3]) + days),
  )
  return shifted.toISOString().slice(0, 10)
}

/**
 * A date and time as a reader in Beirut would read it.
 *
 * Used on the confirmation panel, so what the customer is shown back is the same
 * clock the restaurant works to, whatever their phone is set to.
 */
export function formatBeirut(instant: Date, locale: 'en' | 'ar' = 'en'): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LB' : 'en-GB', {
    timeZone: BEIRUT,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant)
}
