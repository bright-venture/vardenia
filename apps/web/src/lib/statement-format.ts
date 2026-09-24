import type { Locale } from '@vardenia/i18n'
import type { StatementState } from '@vardenia/core'
import { beirutCalendarDayLabel, beirutDate, dateLocale } from './beirut'

/**
 * How a statement's numbers and dates read, in the reader's language.
 *
 * Dollars always, because the agreement is in dollars; the grouping and the
 * digits follow the page's language. Dates are Beirut calendar days, the same
 * rule as the rest of the dashboard.
 */

export function money(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(dateLocale(locale, true), {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

/** "2026-10" as "October 2026" in the page's language. */
export function monthLabel(period: string, locale: Locale): string {
  const [year, month] = period.split('-').map(Number)
  if (!year || !month) return period
  return new Intl.DateTimeFormat(dateLocale(locale, true), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 15)))
}

/** An instant as its Beirut calendar day, "23 November 2026". */
export function dayLabel(instant: string | Date, locale: Locale): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant
  if (Number.isNaN(date.getTime())) return ''
  return beirutCalendarDayLabel(beirutDate(date), locale)
}

/** The message key for each state a venue can see. */
export const STATE_KEY: Record<Exclude<StatementState, 'draft'>, string> = {
  open: 'statementStateOpen',
  overdue: 'statementStateOverdue',
  paid: 'statementStatePaid',
  void: 'statementStateVoid',
}
