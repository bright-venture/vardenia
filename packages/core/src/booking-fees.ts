/**
 * Commissions - what a venue owes Vardenia for the guests it sent, as rules
 * rather than as tables.
 *
 * A venue pays a percentage of what each guest who booked through Vardenia and
 * came actually spent: the bill at a restaurant, the stay at a hotel. The venue
 * enters that amount when it marks the visit, and the guest is asked roughly
 * what they spent; where the two are far apart the team decides (see
 * ./attendance). Nothing is charged for a no-show or a cancellation. Once a
 * month every venue that owes something gets a statement, has a few days to
 * question a line, and a few more to pay.
 *
 * # No rates in here
 *
 * The rate is set in the admin: a default on the Commissions page, which a
 * listing may override from the agreement the venue signed. This file knows the
 * arithmetic and the calendar, never a price: prices live in documents, and a
 * rate written into code would be billed to somebody who never agreed to it.
 * With no rate set anywhere, nobody is billed.
 *
 * # Beirut days, handed in
 *
 * Which month a booking belongs to, and whether a launch offer covers it, are
 * questions about the calendar in Beirut. This package has no timezone code, so
 * callers pass the booking's Beirut day ("YYYY-MM-DD") alongside its instants.
 */

import type { BookingStatus } from './booking'
import type { AttendanceVerdict, GuestAnswer } from './attendance'

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

export interface CommissionSettings {
  /** Percent of what the guest spent, the listing's own or the default. */
  rate?: number | null
  /** "YYYY-MM-DD". Bookings on or before this Beirut day are not billed. */
  waivedUntil?: string | null
}

export interface BillableBooking {
  start: Date
  end: Date
  partySize: number
  status: BookingStatus
  /** What the venue says the guest spent, in US dollars. */
  amount?: number | null
  /** What the guest says they spent, roughly, in US dollars. */
  guestAmount?: number | null
  /** The guest's own answer, and the team's decision where it disagreed. */
  guestAnswer?: GuestAnswer | null
  verdict?: AttendanceVerdict | null
  /** The Beirut day the booking starts on, "YYYY-MM-DD". */
  day: string
}

export interface CommissionLine {
  /** What the guest spent, the amount the rate is taken of. */
  base: number
  /** Percent. */
  rate: number
  amount: number
}

/** Dollars to the cent, without floating-point leftovers like 0.30000000000000004. */
export const toCents = (value: number): number => Math.round(value * 100) / 100

const positive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null

/**
 * The rate that applies to a listing: its own, or the default.
 *
 * A listing's own rate wins even at 0, which is how a venue that agreed to pay
 * nothing is recorded. Empty means "the default".
 */
export function effectiveRate(
  listingRate: number | null | undefined,
  defaultRate: number | null | undefined,
): number | null {
  if (typeof listingRate === 'number' && Number.isFinite(listingRate) && listingRate >= 0) {
    return listingRate
  }
  return positive(defaultRate)
}

/** A commission is set when there is a rate above zero. */
export function hasCommission(settings: CommissionSettings | null | undefined): boolean {
  return positive(settings?.rate) !== null
}

/**
 * What the commission is taken of.
 *
 * The venue's figure, normally. Where the team sided with the guest over the
 * amount, the guest's. Where the venue never gave one - a booking it did not
 * mark, completed after its seven days - the guest's estimate is better than
 * nothing. Null when neither said anything: the line cannot be billed until
 * somebody does.
 */
export function billableAmount(
  booking: Pick<BillableBooking, 'amount' | 'guestAmount' | 'verdict'>,
): number | null {
  const venue = positive(booking.amount)
  const guest = positive(booking.guestAmount)
  if (booking.verdict === 'guest') return guest ?? venue
  return venue ?? guest
}

/** True when the launch offer covers this booking. */
export function isWaived(
  settings: CommissionSettings,
  booking: Pick<BillableBooking, 'day'>,
): boolean {
  return Boolean(settings.waivedUntil && booking.day <= settings.waivedUntil)
}

/**
 * What one booking costs the venue.
 *
 * Null when it costs nothing: no rate, the guest did not come, or the launch
 * offer covers it. `'no-amount'` when it is owed but nobody has said what the
 * guest spent, so the team can chase the venue instead of the line vanishing.
 */
export function commissionFor(
  settings: CommissionSettings | null | undefined,
  booking: BillableBooking,
  now: Date,
): CommissionLine | 'no-amount' | null {
  if (!settings || !hasCommission(settings)) return null
  if (!countsAsCompleted(booking, now)) return null
  if (isWaived(settings, booking)) return null
  const base = billableAmount(booking)
  if (base === null) return 'no-amount'
  const rate = settings.rate as number
  const amount = toCents((toCents(base) * rate) / 100)
  return amount > 0 ? { base: toCents(base), rate, amount } : null
}

/**
 * Whether the guest came, as far as billing is concerned.
 *
 * `completed` says so. A `confirmed` booking the venue never marked counts too,
 * once it ended at least AUTO_COMPLETE_DAYS ago. Everything else - pending,
 * cancelled, no-show, or confirmed and still inside the window - is not billed.
 *
 * Except where the guest and the venue disagreed and the team decided for the
 * guest (see ./attendance): then the guest's answer is what counts. A visit
 * the venue marked a no-show is billed if the guest came; a visit the venue
 * marked completed is not, if the guest did not.
 */
export function countsAsCompleted(
  booking: Pick<BillableBooking, 'status' | 'end'> & {
    guestAnswer?: GuestAnswer | null
    verdict?: AttendanceVerdict | null
  },
  now: Date,
): boolean {
  if (booking.verdict === 'guest') return booking.guestAnswer === 'came'
  if (booking.status === 'completed') return true
  if (booking.status !== 'confirmed') return false
  const end = booking.end.getTime()
  if (!Number.isFinite(end)) return false
  return end + AUTO_COMPLETE_DAYS * DAY_MS <= now.getTime()
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
