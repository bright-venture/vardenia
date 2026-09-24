/**
 * Booking fees - what a venue owes Vardenia for the guests it sent, as rules
 * rather than as tables.
 *
 * A venue pays a small fixed fee for each guest who booked through Vardenia and
 * came: per person at a restaurant or an activity, per night at a hotel or a
 * guesthouse. Nothing is charged for a no-show or a cancellation. Once a month
 * every venue with a fee gets a statement, has a few days to question a line,
 * and a few more to pay.
 *
 * # No amounts in here
 *
 * The fee a venue pays is set on its listing by staff, from the agreement the
 * venue signed. This file knows the arithmetic and the calendar, never a price:
 * prices live in documents, and a default written into code would be billed to
 * somebody who never agreed to it. A listing with no fee set is never billed.
 *
 * # Beirut days, handed in
 *
 * Which month a booking belongs to, and whether a launch offer covers it, are
 * questions about the calendar in Beirut. This package has no timezone code, so
 * callers pass the booking's Beirut day ("YYYY-MM-DD") alongside its instants.
 */

import type { BookingStatus } from './booking'

/** What a fee is counted in. */
export const FEE_UNITS = ['guest', 'night', 'booking'] as const
export type FeeUnit = (typeof FEE_UNITS)[number]

/**
 * A confirmed booking the venue has not marked this many days after it ended
 * counts as completed.
 *
 * Without it the cheapest thing a venue could do is never mark anything, and
 * every booking would sit unbilled for ever. Seven days is long enough for a
 * busy restaurant to catch up on a week of evenings.
 */
export const AUTO_COMPLETE_DAYS = 7

/** Days a venue has, from the statement being sent, to question a line. */
export const DISPUTE_DAYS = 7

/** Days a venue has, from the statement being sent, to pay it. */
export const PAYMENT_DAYS = 15

/**
 * The day of the following month a statement is drawn up.
 *
 * Not the 1st: a booking on the last evening of the month needs its seven days
 * to be marked before it can be billed. On the 8th every booking of the month
 * has had them.
 */
export const STATEMENT_DAY = AUTO_COMPLETE_DAYS + 1

const DAY_MS = 86_400_000

export interface FeeSettings {
  unit?: FeeUnit | null
  /** In US dollars, per unit. */
  amount?: number | null
  /** The most one booking can cost, in US dollars. Empty for no cap. */
  cap?: number | null
  /** "YYYY-MM-DD". Bookings on or before this Beirut day are not billed. */
  waivedUntil?: string | null
}

export interface BillableBooking {
  start: Date
  end: Date
  partySize: number
  status: BookingStatus
  /** The Beirut day the booking starts on, "YYYY-MM-DD". */
  day: string
}

export interface FeeLine {
  unit: FeeUnit
  quantity: number
  rate: number
  amount: number
}

/** Dollars to the cent, without floating-point leftovers like 0.30000000000000004. */
export const toCents = (value: number): number => Math.round(value * 100) / 100

/** A fee is set when there is a unit and an amount above zero. */
export function hasFee(settings: FeeSettings | null | undefined): boolean {
  return Boolean(
    settings?.unit &&
    FEE_UNITS.includes(settings.unit) &&
    typeof settings.amount === 'number' &&
    settings.amount > 0,
  )
}

/**
 * Whether the guest came, as far as billing is concerned.
 *
 * `completed` says so. A `confirmed` booking the venue never marked counts too,
 * once it ended at least AUTO_COMPLETE_DAYS ago. Everything else - pending,
 * cancelled, no-show, or confirmed and still inside the window - is not billed.
 */
export function countsAsCompleted(
  booking: Pick<BillableBooking, 'status' | 'end'>,
  now: Date,
): boolean {
  if (booking.status === 'completed') return true
  if (booking.status !== 'confirmed') return false
  const end = booking.end.getTime()
  if (!Number.isFinite(end)) return false
  return end + AUTO_COMPLETE_DAYS * DAY_MS <= now.getTime()
}

/**
 * Nights in a stay, from check-in to check-out.
 *
 * Rounded to the nearest whole day, because a stay is 14:00 to 11:00 and that
 * is one night, not 0.875 of one. Never less than one: a booking that exists
 * was at least one night.
 */
export function nightsIn(start: Date, end: Date): number {
  const hours = (end.getTime() - start.getTime()) / 3_600_000
  if (!Number.isFinite(hours) || hours <= 0) return 1
  return Math.max(1, Math.round(hours / 24))
}

export function quantityFor(unit: FeeUnit, booking: BillableBooking): number {
  switch (unit) {
    case 'guest':
      return Math.max(1, Math.floor(booking.partySize))
    case 'night':
      return nightsIn(booking.start, booking.end)
    case 'booking':
      return 1
  }
}

/** True when the launch offer covers this booking. */
export function isWaived(settings: FeeSettings, booking: Pick<BillableBooking, 'day'>): boolean {
  return Boolean(settings.waivedUntil && booking.day <= settings.waivedUntil)
}

/**
 * What one booking costs the venue, or null when it costs nothing.
 *
 * Null when no fee is set, when the guest did not come, or when the launch
 * offer covers it. The cap applies to the whole booking: a table of fourteen at
 * a restaurant capped at twelve is twelve.
 */
export function feeFor(
  settings: FeeSettings | null | undefined,
  booking: BillableBooking,
  now: Date,
): FeeLine | null {
  if (!settings || !hasFee(settings)) return null
  if (!countsAsCompleted(booking, now)) return null
  if (isWaived(settings, booking)) return null

  const unit = settings.unit as FeeUnit
  const rate = toCents(settings.amount as number)
  const quantity = quantityFor(unit, booking)
  const full = toCents(rate * quantity)
  const cap = typeof settings.cap === 'number' && settings.cap > 0 ? toCents(settings.cap) : null
  const amount = cap !== null ? Math.min(full, cap) : full

  return amount > 0 ? { unit, quantity, rate, amount } : null
}

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isPeriod(value: unknown): value is string {
  return typeof value === 'string' && PERIOD.test(value)
}

/** "2026-10-14" to "2026-10". */
export function periodOf(day: string): string {
  return day.slice(0, 7)
}

/** The first Beirut day of the period and of the one after it. */
export function periodBounds(period: string): { first: string; next: string } {
  const match = PERIOD.exec(period)
  if (!match) throw new Error(`Not a period: ${period}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  return { first: `${year}-${pad(month)}-01`, next: `${nextYear}-${pad(nextMonth)}-01` }
}

/** The Beirut day a period's statements can be drawn up: the 8th of the next month. */
export function statementReadyOn(period: string): string {
  return `${periodBounds(period).next.slice(0, 8)}${String(STATEMENT_DAY).padStart(2, '0')}`
}

/** The month before the one this Beirut day is in. */
export function previousPeriod(day: string): string {
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7))
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export const STATEMENT_STATUSES = ['draft', 'sent', 'paid', 'void'] as const
export type StatementStatus = (typeof STATEMENT_STATUSES)[number]

/**
 * What happened to a questioned line.
 *
 * `open` is waiting for the team. `upheld` means the venue was right: the line
 * comes off the total. `rejected` means the guest did come: the line stays.
 */
export const DISPUTE_OUTCOMES = ['none', 'open', 'upheld', 'rejected'] as const
export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number]

export interface StatementLineAmount {
  amount?: number | null
  disputeOutcome?: DisputeOutcome | null
}

/** Only an upheld dispute takes a line off. An open one still counts until decided. */
export function lineCounts(line: StatementLineAmount): boolean {
  return line.disputeOutcome !== 'upheld'
}

export function statementTotals(
  lines: readonly StatementLineAmount[],
  vatRate = 0,
): { subtotal: number; vat: number; total: number } {
  const subtotal = toCents(
    lines.filter(lineCounts).reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
  )
  const rate = Number.isFinite(vatRate) && vatRate > 0 ? vatRate : 0
  const vat = toCents((subtotal * rate) / 100)
  return { subtotal, vat, total: toCents(subtotal + vat) }
}

/** The two deadlines a statement carries, counted from the moment it is sent. */
export function statementDeadlines(sentAt: Date): { disputeUntil: Date; dueAt: Date } {
  return {
    disputeUntil: new Date(sentAt.getTime() + DISPUTE_DAYS * DAY_MS),
    dueAt: new Date(sentAt.getTime() + PAYMENT_DAYS * DAY_MS),
  }
}

/**
 * Where a statement stands, for a person reading it.
 *
 * `overdue` is not stored: it is `sent` past its due date, and a stored flag
 * would be wrong the morning after nobody updated it.
 */
export type StatementState = 'draft' | 'open' | 'overdue' | 'paid' | 'void'

export function statementState(
  statement: { status: StatementStatus; dueAt?: Date | string | null },
  now: Date,
): StatementState {
  if (statement.status !== 'sent') return statement.status
  const due = statement.dueAt ? new Date(statement.dueAt).getTime() : NaN
  return Number.isFinite(due) && due < now.getTime() ? 'overdue' : 'open'
}

/** A venue may question a line of a sent statement, once, inside the window. */
export function canDispute(
  statement: { status: StatementStatus; disputeUntil?: Date | string | null },
  line: { disputeOutcome?: DisputeOutcome | null },
  now: Date,
): boolean {
  if (statement.status !== 'sent') return false
  if (line.disputeOutcome && line.disputeOutcome !== 'none') return false
  const until = statement.disputeUntil ? new Date(statement.disputeUntil).getTime() : NaN
  return Number.isFinite(until) && now.getTime() <= until
}

/** "VRD-2026-0007": the year and a running number, the way invoices are numbered. */
export function statementNumber(year: number, sequence: number): string {
  return `VRD-${year}-${String(sequence).padStart(4, '0')}`
}
