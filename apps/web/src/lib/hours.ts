/**
 * Opening hours, and the "Open now" question.
 *
 * Time is evaluated in Asia/Beirut, never in the visitor's timezone. A reader in
 * Dubai or Paris asking whether a Beirut restaurant is open means "is it open
 * there, now", and getting that wrong sends someone to a closed door.
 */

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export const DAY_LABELS: Record<DayKey, { en: string; ar: string }> = {
  mon: { en: 'Monday', ar: 'الاثنين' },
  tue: { en: 'Tuesday', ar: 'الثلاثاء' },
  wed: { en: 'Wednesday', ar: 'الأربعاء' },
  thu: { en: 'Thursday', ar: 'الخميس' },
  fri: { en: 'Friday', ar: 'الجمعة' },
  sat: { en: 'Saturday', ar: 'السبت' },
  sun: { en: 'Sunday', ar: 'الأحد' },
}

export interface OpeningHour {
  day?: DayKey | null
  opens?: string | null
  closes?: string | null
  closed?: boolean | null
}

const BEIRUT = 'Asia/Beirut'

/** Minutes since midnight, or null if the value is not "HH:MM". */
function toMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * Current weekday and minutes-since-midnight in Beirut, or null if we cannot
 * establish them.
 *
 * Null rather than a default. This used to fall back to Monday when the weekday
 * did not parse, which is the one place in this module that guessed - and the
 * failure it guesses through is not hypothetical: a Node built with `small-icu`,
 * which is what several slim and Alpine Docker images ship, does not carry the
 * Asia/Beirut rules. `Asia/Beirut` then silently degrades to UTC and the short
 * weekday may not match either. Every listing in the country would be judged
 * against Monday's hours in the wrong timezone, confidently, with nothing in the
 * logs. The docstring at the top of this file says guessing is worse than
 * silence; this is where it was guessing.
 */
function beirutNow(now = new Date()): { day: DayKey; minutes: number } | null {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BEIRUT,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const weekday = get('weekday').toLowerCase().slice(0, 3) as DayKey
  const hour = Number(get('hour'))
  const minute = Number(get('minute'))

  if (!DAY_ORDER.includes(weekday)) return null
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour > 23 || minute > 59) return null

  return { day: weekday, minutes: hour * 60 + minute }
}

/**
 * `null` means "we do not know" (no hours recorded), which the UI must render
 * differently from a confident "Closed". Guessing here is worse than silence.
 */
export function isOpenNow(
  hours: OpeningHour[] | null | undefined,
  now = new Date(),
): boolean | null {
  if (!Array.isArray(hours) || hours.length === 0) return null

  const current = beirutNow(now)
  // Cannot establish the time in Beirut, so we do not know. Saying "Closed"
  // here would send a reader away from a place that is open.
  if (!current) return null

  const { day, minutes } = current
  const yesterday = DAY_ORDER[(DAY_ORDER.indexOf(day) + 6) % 7]

  const entryFor = (key: DayKey) => hours.find((h) => h.day === key)

  const today = entryFor(day)
  if (today && !today.closed) {
    const opens = toMinutes(today.opens)
    const closes = toMinutes(today.closes)
    if (opens !== null && closes !== null) {
      // Same-day window, e.g. 09:00 to 23:00.
      if (closes > opens && minutes >= opens && minutes < closes) return true
      // Past-midnight window, e.g. 20:00 to 03:00. Still "today's" session.
      if (closes <= opens && minutes >= opens) return true
    }
  }

  // A window that began yesterday and has not closed yet, e.g. it is 01:30 and
  // last night's session runs to 03:00.
  const prior = yesterday ? entryFor(yesterday) : undefined
  if (prior && !prior.closed) {
    const opens = toMinutes(prior.opens)
    const closes = toMinutes(prior.closes)
    if (opens !== null && closes !== null && closes <= opens && minutes < closes) return true
  }

  return false
}

/** "09:00 - 23:00", or a closed/unknown marker. */
export function formatDay(entry: OpeningHour | undefined): string | null {
  if (!entry || entry.closed) return null
  const opens = toMinutes(entry.opens)
  const closes = toMinutes(entry.closes)
  if (opens === null || closes === null) return null
  return `${entry.opens} - ${entry.closes}`
}

/** Hours in week order, so the CMS row order cannot scramble the display. */
export function orderedHours(hours: OpeningHour[] | null | undefined): OpeningHour[] {
  if (!Array.isArray(hours)) return []
  return DAY_ORDER.map((day) => hours.find((h) => h.day === day) ?? { day, closed: true })
}
