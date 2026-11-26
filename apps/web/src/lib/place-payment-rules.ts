import { normaliseLebanesePhone } from './lebanese-phone'

/**
 * The two-stage payment of the Magazine Places form, as pure rules (spec v4,
 * 24 November 2026). No database here: lib/place-payments reads the business
 * under its lock, asks these functions what may happen and what the result
 * is, and writes it. Everything is tested in place-payment-rules.test.ts.
 *
 * Money is counted in whole cents (integers) and stored as dollars with two
 * decimals, so 0.1 + 0.2 never becomes 0.30000000000000004.
 */

export type SubmissionStatus =
  | 'incomplete'
  | 'abandoned'
  | 'awaiting_downpayment'
  | 'pending'
  | 'accepted'
  | 'paid'
  | 'lapsed'
  | 'approved'
  | 'rejected'
  | 'expired'

export type PaymentStage =
  'none' | 'downpayment_paid' | 'waived' | 'fully_paid' | 'refund_due' | 'refunded' | 'kept'

export type EntryType = 'downpayment' | 'balance' | 'refund'
export type PaymentMethod = 'whish' | 'desk' | 'cash'

export interface PaymentEntry {
  id?: string | null
  type: EntryType
  amount: number
  currency?: string | null
  senderNumber?: string | null
  whishAt?: string | null
  method?: PaymentMethod | null
  note?: string | null
  recordedBy?: number | string | null
  recordedAt?: string | null
  voided?: boolean | null
  voidedBy?: number | string | null
  voidedAt?: string | null
  voidReason?: string | null
  forfeited?: boolean | null
}

export type PaymentAction =
  | 'recordDownpayment'
  | 'accept'
  | 'rejectNotAccepted'
  | 'recordRefundSent'
  | 'recordBalance'
  | 'rejectUnpaid'
  | 'lapseUnpaidDownpayment'
  | 'waiveDownpayment'
  | 'undoMoneyEntry'
  | 'extendDeadline'

/**
 * Actions only an admin may take (spec item 12). The rest are for staff and
 * admins. There is no "accept without payment" and no "publish without
 * payment" (lead decision, 24 Nov 2026): a place is published only once
 * fully paid.
 */
export const ADMIN_ONLY_ACTIONS: ReadonlySet<PaymentAction> = new Set([
  'waiveDownpayment',
  'undoMoneyEntry',
])

export type RefusalCode =
  | 'not-staff'
  | 'not-admin'
  | 'not-found'
  | 'bad-input'
  | 'wrong-state'
  | 'published'
  | 'duplicate-payment'
  | 'number-taken'
  | 'no-price'
  | 'changed'
  | 'error'

export interface Refusal {
  code: RefusalCode
  message: string
}

export const refuse = (code: RefusalCode, message: string): Refusal => ({ code, message })

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** Dollars to whole cents. Inputs are rounded to the nearest cent. */
export const toCents = (amount: number): number => Math.round(amount * 100)

/** Whole cents to dollars with at most two decimals. */
export const fromCents = (cents: number): number => Math.round(cents) / 100

/** The downpayment for a price: price x percent / 100, rounded to the cent. */
export function downpaymentFor(price: number, percent: number): number {
  return fromCents(Math.round((toCents(price) * percent) / 100))
}

/** "$500" or "$12.50", or "500 EUR" for another currency. For notes and messages. */
export function formatMoney(amount: number, currency = 'USD'): string {
  const cents = toCents(amount)
  const text = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)
  const code = currency.toUpperCase()
  return code === 'USD' || !code ? `$${text}` : `${text} ${code}`
}

const live = (entry: PaymentEntry) => entry.voided !== true

export interface MoneySummary {
  received: number
  refunded: number
  stillToPay: number
}

/**
 * What was received (downpayments and payments of the rest), what was
 * refunded, and what is still to pay against the price. Voided lines count
 * for nothing. Still to pay never goes below zero.
 */
export function summarise(entries: readonly PaymentEntry[], price: number): MoneySummary {
  let received = 0
  let refunded = 0
  for (const entry of entries.filter(live)) {
    const cents = toCents(entry.amount)
    if (entry.type === 'refund') refunded += cents
    else received += cents
  }
  return {
    received: fromCents(received),
    refunded: fromCents(refunded),
    stillToPay: fromCents(Math.max(0, toCents(price) - received)),
  }
}

export const hasLiveDownpayment = (entries: readonly PaymentEntry[]) =>
  entries.some((e) => live(e) && e.type === 'downpayment')

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000

export const addDays = (from: Date, days: number): Date => new Date(from.getTime() + days * DAY_MS)

/** Calendar months later, same time of day; the 31st of a short month becomes its last day. */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime())
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const MAX_NOTE_LENGTH = 1000
export const MAX_AMOUNT = 1_000_000
export const MAX_EXTENSION_DAYS = 90
/** A Whish time may be this far in the future (clock skew between phones). */
const FUTURE_SLACK_MS = 10 * 60 * 1000

/** A positive amount with at most two decimals, as a number. Strings like "500" are read. */
export function parseAmount(value: unknown): number | Refusal {
  const n = typeof value === 'string' && value.trim() ? Number(value.trim()) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    return refuse('bad-input', 'Write the amount received, more than 0.')
  }
  if (n > MAX_AMOUNT) return refuse('bad-input', 'That amount is too large. Check it.')
  if (Math.abs(toCents(n) - n * 100) > 1e-6) {
    return refuse('bad-input', 'Write the amount with at most two decimals, like 500 or 12.50.')
  }
  return fromCents(toCents(n))
}

/** Optional text, trimmed; too long is refused. */
export function parseNote(value: unknown, what = 'note'): string | Refusal {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return refuse('bad-input', `The ${what} must be text.`)
  const text = value.trim()
  if (text.length > MAX_NOTE_LENGTH) {
    return refuse('bad-input', `Keep the ${what} under ${MAX_NOTE_LENGTH} characters.`)
  }
  return text
}

/** A required reason (waive, undo, extend, reject). */
export function parseReason(value: unknown, missing = 'Write the reason first.'): string | Refusal {
  const text = parseNote(value, 'reason')
  if (typeof text !== 'string') return text
  if (!text) return refuse('bad-input', missing)
  return text
}

export function parseMethod(value: unknown): PaymentMethod | Refusal {
  if (value === undefined || value === null || value === '') return 'whish'
  if (value === 'whish' || value === 'desk' || value === 'cash') return value
  return refuse('bad-input', 'Choose how it was paid: Whish, at the desk or cash.')
}

/** The sender in the one shape every check compares (lib/lebanese-phone). */
export function parseSender(value: unknown, required: boolean): string | null | Refusal {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    return required ? refuse('bad-input', 'Write the number the money was sent from.') : null
  }
  const phone = normaliseLebanesePhone(value)
  if (!phone) {
    return refuse(
      'bad-input',
      'The sender is not a Lebanese phone number. Check it, like 03 123 456.',
    )
  }
  return phone
}

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i

/**
 * The Whish date and time, with its time zone (Z or +02:00), cut to the minute
 * (Whish shows minutes), as ISO. A time without a zone is refused rather than
 * guessed: the server runs in UTC and Lebanon does not.
 */
export function parseWhishAt(
  value: unknown,
  required: boolean,
  now: Date,
): string | null | Refusal {
  if (value === undefined || value === null || value === '') {
    return required ? refuse('bad-input', 'Write the date and time shown in Whish.') : null
  }
  if (typeof value !== 'string' || !HAS_ZONE.test(value.trim())) {
    return refuse('bad-input', 'Give the Whish date and time with its time zone.')
  }
  const date = new Date(value.trim())
  if (Number.isNaN(date.getTime())) {
    return refuse('bad-input', 'The Whish date and time could not be read.')
  }
  if (date.getTime() > now.getTime() + FUTURE_SLACK_MS) {
    return refuse('bad-input', 'The Whish date and time is in the future. Check it.')
  }
  date.setUTCSeconds(0, 0)
  return date.toISOString()
}

export function parseDays(value: unknown): number | Refusal {
  const n = typeof value === 'string' && value.trim() ? Number(value.trim()) : value
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_EXTENSION_DAYS) {
    return refuse('bad-input', `Extend by a whole number of days, 1 to ${MAX_EXTENSION_DAYS}.`)
  }
  return n
}

export const isRefusal = (value: unknown): value is Refusal =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Refusal).code === 'string' &&
  typeof (value as Refusal).message === 'string'

// ---------------------------------------------------------------------------
// Duplicate Whish transfers
// ---------------------------------------------------------------------------

const sameMinute = (a: string, b: string) => {
  const x = new Date(a)
  const y = new Date(b)
  if (Number.isNaN(x.getTime()) || Number.isNaN(y.getTime())) return false
  x.setUTCSeconds(0, 0)
  y.setUTCSeconds(0, 0)
  return x.getTime() === y.getTime()
}

/**
 * Whether a transfer from `sender` at `whishAt` is already recorded on one of
 * these businesses, as money in (downpayment or rest) that was not undone.
 * Both sides are compared normalised (phone shape, time to the minute), and
 * on the SAME line: a database query on an array matches any line for each
 * condition, so it only narrows the candidates.
 */
export function findDuplicateTransfer(
  businesses: readonly { id: number | string; entries: readonly PaymentEntry[] }[],
  sender: string,
  whishAt: string,
): { businessId: number | string } | null {
  for (const business of businesses) {
    for (const entry of business.entries) {
      if (!live(entry) || entry.type === 'refund') continue
      if (!entry.senderNumber || !entry.whishAt) continue
      const theirs = normaliseLebanesePhone(entry.senderNumber) ?? entry.senderNumber
      if (theirs === sender && sameMinute(entry.whishAt, whishAt)) {
        return { businessId: business.id }
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Which action may happen now
// ---------------------------------------------------------------------------

export interface SubmissionView {
  status: SubmissionStatus | null
  stage: PaymentStage
  published: boolean
  entries: readonly PaymentEntry[]
  price: number
}

const STATUS_WORDS: Record<string, string> = {
  incomplete: 'still being filled in',
  abandoned: 'abandoned',
  awaiting_downpayment: 'waiting for the downpayment',
  pending: 'in review',
  accepted: 'accepted and waiting for the rest',
  paid: 'fully paid',
  lapsed: 'lapsed',
  approved: 'published',
  rejected: 'rejected',
  expired: 'expired',
}

const wrong = (view: SubmissionView, what: string) =>
  refuse(
    'wrong-state',
    `${what} This submission is ${view.status ? (STATUS_WORDS[view.status] ?? view.status) : 'not a form submission'}.`,
  )

/**
 * Null when `action` may happen to a submission in this state, otherwise the
 * plain reason why not. Role checks are separate (ADMIN_ONLY_ACTIONS).
 */
export function refusalFor(action: PaymentAction, view: SubmissionView): Refusal | null {
  const s = view.status
  if (view.published && action !== 'undoMoneyEntry') {
    return refuse('published', 'This listing is published. Set it to Draft first.')
  }
  switch (action) {
    case 'recordDownpayment':
      return s === 'awaiting_downpayment'
        ? null
        : wrong(view, 'A downpayment can be recorded only while it is awaited.')
    case 'waiveDownpayment':
      return s === 'awaiting_downpayment'
        ? null
        : wrong(view, 'The downpayment can be waived only while it is awaited.')
    case 'accept':
      if (s === 'awaiting_downpayment') {
        return refuse(
          'wrong-state',
          'The downpayment has not been received. Record it first (or an admin waives it).',
        )
      }
      if (s !== 'pending') return wrong(view, 'Only a submission in review can be accepted.')
      return view.stage === 'downpayment_paid' || view.stage === 'waived'
        ? null
        : refuse('wrong-state', 'Record the downpayment before accepting this submission.')
    case 'rejectNotAccepted':
      return s === 'pending' || s === 'awaiting_downpayment' || s === 'incomplete'
        ? null
        : s === 'rejected'
          ? refuse('wrong-state', 'This submission was already rejected.')
          : wrong(
              view,
              'Only a submission in review, waiting for the downpayment, or still being filled in can be rejected as not accepted.',
            )
    case 'recordRefundSent':
      return s === 'rejected' && view.stage === 'refund_due'
        ? null
        : refuse('wrong-state', 'There is no refund to send for this submission.')
    case 'recordBalance':
      return s === 'accepted'
        ? null
        : wrong(view, 'A payment of the rest can be recorded only after acceptance.')
    case 'rejectUnpaid':
      return s === 'accepted'
        ? null
        : wrong(view, 'Only an accepted submission can be rejected for not paying the rest.')
    case 'lapseUnpaidDownpayment':
      return s === 'awaiting_downpayment'
        ? null
        : wrong(view, 'Only a submission waiting for the downpayment can lapse.')
    case 'undoMoneyEntry':
      return s === 'approved' || view.published
        ? refuse(
            'published',
            'This listing is published, so its money lines can no longer be undone.',
          )
        : null
    case 'extendDeadline':
      return s === 'awaiting_downpayment' || s === 'lapsed' || s === 'accepted'
        ? null
        : wrong(
            view,
            'Only a deadline that is still running (or a lapsed downpayment) can be extended.',
          )
  }
}

// ---------------------------------------------------------------------------
// What an action leads to
// ---------------------------------------------------------------------------

/**
 * After the rest is paid in part or in full. Refused without a price above 0:
 * a missing price snapshot reads as 0, and must never look fully paid (free
 * places are not offered: the Settings price is at least 1).
 */
export function afterBalance(
  entries: readonly PaymentEntry[],
  price: number,
): { status: 'accepted' | 'paid'; summary: MoneySummary } | Refusal {
  if (!(toCents(price) > 0)) {
    return refuse(
      'no-price',
      'This submission has no price above 0 on file, so what is still to pay cannot be counted. Ask an admin.',
    )
  }
  const summary = summarise(entries, price)
  return { status: summary.stillToPay === 0 ? 'paid' : 'accepted', summary }
}

/** Accepting: a downpayment that already covers the price is fully paid at once. */
export function afterAccept(
  entries: readonly PaymentEntry[],
  price: number,
  stage: PaymentStage,
): { status: 'accepted' | 'paid'; stage: PaymentStage } {
  const { stillToPay } = summarise(entries, price)
  return stillToPay === 0 && price > 0
    ? { status: 'paid', stage: 'fully_paid' }
    : { status: 'accepted', stage: stage === 'none' ? 'waived' : stage }
}

/** Stage after "not accepted": money received must be returned. */
export function stageAfterNotAccepted(
  entries: readonly PaymentEntry[],
  price: number,
): PaymentStage {
  const { received, refunded } = summarise(entries, price)
  return toCents(received) > toCents(refunded) ? 'refund_due' : 'none'
}

/** Stage after a refund line: refunded once everything received went back. */
export function stageAfterRefund(entries: readonly PaymentEntry[], price: number): PaymentStage {
  const { received, refunded } = summarise(entries, price)
  return toCents(refunded) >= toCents(received) ? 'refunded' : 'refund_due'
}

/** "Did not pay the rest": what was received is kept, each line marked. */
export function forfeitReceived(entries: readonly PaymentEntry[]): {
  entries: PaymentEntry[]
  stage: PaymentStage
} {
  let kept = false
  const next = entries.map((e) => {
    if (!live(e) || e.type === 'refund') return { ...e }
    kept = true
    return { ...e, forfeited: true }
  })
  return { entries: next, stage: kept ? 'kept' : 'none' }
}

/**
 * Undoing one money line (admin): the line is voided, and the status and
 * stage step back to what the remaining lines support. Refused where stepping
 * back would undo a decision (an acceptance, a rejection) rather than a typo.
 */
export function afterUndo(
  view: SubmissionView,
  entryId: string,
): { status: SubmissionStatus; stage: PaymentStage; entry: PaymentEntry } | Refusal {
  const entry = view.entries.find((e) => e.id === entryId)
  if (!entry) return refuse('not-found', 'That money line was not found on this submission.')
  if (!live(entry)) return refuse('wrong-state', 'That money line was already undone.')
  const rest = view.entries.map((e) => (e === entry ? { ...e, voided: true } : e))
  const s = view.status
  // Accepted or paid: recounted against the price, as a payment of the rest is.
  const recount = ():
    { status: SubmissionStatus; stage: PaymentStage; entry: PaymentEntry } | Refusal => {
    const counted = afterBalance(rest, view.price)
    if (isRefusal(counted)) return counted
    const { status } = counted
    const downStage: PaymentStage = hasLiveDownpayment(rest) ? 'downpayment_paid' : 'waived'
    return { status, stage: status === 'paid' ? 'fully_paid' : downStage, entry }
  }

  if (entry.type === 'refund') {
    if (s !== 'rejected') return refuse('wrong-state', 'This refund line can no longer be undone.')
    return { status: s, stage: stageAfterNotAccepted(rest, view.price), entry }
  }

  if (entry.type === 'downpayment') {
    if (hasLiveDownpayment(rest)) {
      // A second downpayment line remains. After acceptance the money is
      // recounted (paid may step back to accepted); before it, nothing moves.
      if (s === 'accepted' || s === 'paid') return recount()
      return { status: s ?? 'pending', stage: view.stage, entry }
    }
    if (s === 'pending' && view.stage === 'downpayment_paid') {
      return { status: 'awaiting_downpayment', stage: 'none', entry }
    }
    return refuse(
      'wrong-state',
      s === 'pending'
        ? 'This downpayment line can no longer be undone.'
        : 'This submission was already accepted or closed on this downpayment, so it cannot be undone. Reject it or ask an admin to correct it another way.',
    )
  }

  // A payment of the rest.
  if (s === 'accepted' || s === 'paid') return recount()
  return refuse('wrong-state', 'This payment line can no longer be undone.')
}

/**
 * Whether a recorded amount differs from what was expected, which needs a note
 * (a warning, not a block: the owner may have sent a little more or less).
 */
export const differsFromExpected = (amount: number, expected: number) =>
  toCents(amount) !== toCents(expected)
