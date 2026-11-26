import type { Payload } from 'payload'
import { isAdminUser } from '../access/index'
import { addDays, beirutDate } from './beirut'
import { fromCents, toCents } from './place-payment-rules'

/**
 * The Magazine Places reports (PRD v4 A16, admin only), shown at
 * /admin/place-reports (components/admin/PlaceReports):
 *
 * - money entries week by week, to tick off against the Whish history
 * - refunds still to send
 * - downpayments kept (the owner did not pay the rest)
 * - contracts ending in the next 30 days
 *
 * Read-only. Everything below is pure except `loadPlaceReports`, which
 * checks the role before it reads anything and reads with the admin's own
 * access (`overrideAccess: false`).
 */

export const DEFAULT_WEEKS = 8
export const MAX_WEEKS = 52
export const CONTRACT_WINDOW_DAYS = 30

const DAY = 86_400_000

export const canSeePlaceReports = (user: unknown): boolean => isAdminUser(user)

interface PaymentLine {
  id?: string | null
  type?: string | null
  amount?: number | null
  currency?: string | null
  senderNumber?: string | null
  whishAt?: string | null
  method?: string | null
  note?: string | null
  recordedAt?: string | null
  recordedBy?: number | string | { name?: string | null } | null
  voided?: boolean | null
  forfeited?: boolean | null
}

export interface ReportBusiness {
  id: number | string
  name?: string | null
  listingNumber?: number | null
  submission?: {
    reference?: string | null
    status?: string | null
    rejectedAt?: string | null
    payments?: PaymentLine[] | null
    payment?: {
      stage?: string | null
      currency?: string | null
      received?: number | null
      refunded?: number | null
    } | null
  } | null
}

export interface MoneyLine {
  businessId: number | string
  name: string
  reference: string | null
  type: 'downpayment' | 'balance' | 'refund'
  amount: number
  currency: string
  /** When the money moved: the Whish time, or when it was recorded. */
  at: string
  /** The Beirut calendar day of `at`. */
  day: string
  senderNumber: string | null
  method: string | null
  recordedBy: string | null
  note: string | null
}

export interface MoneyWeek {
  /** The Monday the week starts on, YYYY-MM-DD in Beirut. */
  start: string
  lines: MoneyLine[]
  received: number
  refunded: number
}

/** The Monday of a YYYY-MM-DD day's week. */
export function weekStart(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7))
}

/** The first day of the window: the Monday `weeks - 1` weeks before this one. */
export function windowStart(now: Date, weeks: number): string {
  return addDays(weekStart(beirutDate(now)), -7 * (weeks - 1))
}

/** `?weeks=` as a whole number within 1..MAX_WEEKS, or the default. */
export function parseWeeks(value: unknown): number {
  const n = typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : NaN
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_WEEKS) : DEFAULT_WEEKS
}

const who = (by: PaymentLine['recordedBy']): string | null =>
  by && typeof by === 'object' ? (by.name ?? null) : null

const TYPES = new Set(['downpayment', 'balance', 'refund'])

/**
 * Every live money line (voided ones are left out: they were undone) whose
 * day is on or after `fromDay`, oldest first.
 */
export function moneyLines(businesses: readonly ReportBusiness[], fromDay: string): MoneyLine[] {
  const lines: MoneyLine[] = []
  for (const business of businesses) {
    for (const line of business.submission?.payments ?? []) {
      if (line.voided === true || !line.type || !TYPES.has(line.type)) continue
      const at = line.whishAt || line.recordedAt
      if (!at) continue
      const instant = new Date(at)
      if (Number.isNaN(instant.getTime())) continue
      const day = beirutDate(instant)
      if (day < fromDay) continue
      lines.push({
        businessId: business.id,
        name: business.name ?? `Listing ${business.id}`,
        reference: business.submission?.reference ?? null,
        type: line.type as MoneyLine['type'],
        amount: Number(line.amount ?? 0),
        currency: line.currency || business.submission?.payment?.currency || 'USD',
        at: instant.toISOString(),
        day,
        senderNumber: line.senderNumber ?? null,
        method: line.method ?? null,
        recordedBy: who(line.recordedBy),
        note: line.note ?? null,
      })
    }
  }
  return lines.sort((a, b) => a.at.localeCompare(b.at))
}

/** The lines by week, newest week first; totals in whole cents, then dollars. */
export function byWeek(lines: readonly MoneyLine[]): MoneyWeek[] {
  const weeks = new Map<string, { lines: MoneyLine[]; received: number; refunded: number }>()
  for (const line of lines) {
    const start = weekStart(line.day)
    const week = weeks.get(start) ?? { lines: [], received: 0, refunded: 0 }
    week.lines.push(line)
    if (line.type === 'refund') week.refunded += toCents(line.amount)
    else week.received += toCents(line.amount)
    weeks.set(start, week)
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([start, week]) => ({
      start,
      lines: week.lines,
      received: fromCents(week.received),
      refunded: fromCents(week.refunded),
    }))
}

export interface OwedLine {
  businessId: number | string
  name: string
  reference: string | null
  amount: number
  currency: string
  since: string | null
}

/** Rejected after paying: what is still to go back, oldest first. */
export function refundsOutstanding(businesses: readonly ReportBusiness[]): OwedLine[] {
  return businesses
    .filter((b) => b.submission?.payment?.stage === 'refund_due')
    .map((b) => {
      const payment = b.submission?.payment
      const owed = toCents(Number(payment?.received ?? 0)) - toCents(Number(payment?.refunded ?? 0))
      return {
        businessId: b.id,
        name: b.name ?? `Listing ${b.id}`,
        reference: b.submission?.reference ?? null,
        amount: fromCents(Math.max(0, owed)),
        currency: payment?.currency || 'USD',
        since: b.submission?.rejectedAt ?? null,
      }
    })
    .sort((a, b) => (a.since ?? '').localeCompare(b.since ?? ''))
}

/**
 * Did not pay the rest: what was kept. The lines the engine marked forfeited,
 * not voided; a row with none marked falls back to the recorded total.
 */
export function downpaymentsKept(businesses: readonly ReportBusiness[]): OwedLine[] {
  return businesses
    .filter((b) => b.submission?.payment?.stage === 'kept')
    .map((b) => {
      const lines = (b.submission?.payments ?? []).filter(
        (l) => l.forfeited === true && l.voided !== true && l.type !== 'refund',
      )
      const cents =
        lines.length > 0
          ? lines.reduce((sum, l) => sum + toCents(Number(l.amount ?? 0)), 0)
          : toCents(Number(b.submission?.payment?.received ?? 0))
      return {
        businessId: b.id,
        name: b.name ?? `Listing ${b.id}`,
        reference: b.submission?.reference ?? null,
        amount: fromCents(cents),
        currency: b.submission?.payment?.currency || 'USD',
        since: b.submission?.rejectedAt ?? null,
      }
    })
    .sort((a, b) => (b.since ?? '').localeCompare(a.since ?? ''))
}

export interface EndingContract {
  businessId: number | string
  name: string
  reference: string | null
  endsAt: string
  published: boolean
}

export interface PlaceReports {
  weeks: number
  fromDay: string
  moneyWeeks: MoneyWeek[]
  refunds: OwedLine[]
  kept: OwedLine[]
  contracts: EndingContract[]
}

/**
 * The reports, for an admin only: null for anyone else, before any query.
 * Two queries: listings with money (recorded in the window, or a refund still
 * owed, or a kept downpayment), and contracts ending soon.
 */
export async function loadPlaceReports(
  payload: Payload,
  user: unknown,
  { now = new Date(), weeks = DEFAULT_WEEKS }: { now?: Date; weeks?: number } = {},
): Promise<PlaceReports | null> {
  if (!canSeePlaceReports(user)) return null
  const fromDay = windowStart(now, weeks)
  // A day earlier than the window, in UTC: Beirut is ahead of UTC, so this
  // never misses a line; moneyLines cuts to the exact Beirut day.
  const since = new Date(`${addDays(fromDay, -1)}T00:00:00Z`).toISOString()
  const until = new Date(now.getTime() + CONTRACT_WINDOW_DAYS * DAY).toISOString()

  const [money, contracts] = await Promise.all([
    payload.find({
      collection: 'businesses',
      depth: 1,
      pagination: false,
      overrideAccess: false,
      user: user as never,
      // Money moved even if the listing was later put in the trash.
      trash: true,
      where: {
        or: [
          { 'submission.payments.recordedAt': { greater_than_equal: since } },
          { 'submission.payments.whishAt': { greater_than_equal: since } },
          { 'submission.payment.stage': { in: ['refund_due', 'kept'] } },
        ],
      },
      select: {
        name: true,
        listingNumber: true,
        submission: {
          reference: true,
          status: true,
          rejectedAt: true,
          payments: true,
          payment: { stage: true, currency: true, received: true, refunded: true },
        },
      },
      populate: { users: { name: true } },
    }),
    payload.find({
      collection: 'businesses',
      depth: 0,
      pagination: false,
      overrideAccess: false,
      user: user as never,
      where: {
        and: [
          { contractEndsAt: { greater_than_equal: now.toISOString() } },
          { contractEndsAt: { less_than: until } },
          { isSample: { not_equals: true } },
        ],
      },
      sort: 'contractEndsAt',
      select: { name: true, contractEndsAt: true, _status: true, submission: { reference: true } },
    }),
  ])

  const businesses = money.docs as unknown as ReportBusiness[]
  return {
    weeks,
    fromDay,
    moneyWeeks: byWeek(moneyLines(businesses, fromDay)),
    refunds: refundsOutstanding(businesses),
    kept: downpaymentsKept(businesses),
    contracts: (
      contracts.docs as unknown as {
        id: number | string
        name?: string | null
        contractEndsAt?: string | null
        _status?: string | null
        submission?: { reference?: string | null } | null
      }[]
    )
      .filter((doc) => doc.contractEndsAt)
      .map((doc) => ({
        businessId: doc.id,
        name: doc.name ?? `Listing ${doc.id}`,
        reference: doc.submission?.reference ?? null,
        endsAt: doc.contractEndsAt as string,
        published: doc._status === 'published',
      })),
  }
}
