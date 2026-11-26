import {
  ADMIN_ONLY_ACTIONS,
  afterUndo,
  differsFromExpected,
  downpaymentFor,
  formatMoney,
  isRefusal,
  parseAmount,
  refusalFor,
  summarise,
  toCents,
  type PaymentAction,
  type PaymentEntry,
  type PaymentStage,
  type SubmissionStatus,
  type SubmissionView,
} from './place-payment-rules'

/**
 * What the "Payment and review" panel on a business shows, as pure functions
 * (Task 11b). The panel (components/admin/PaymentReviewPanel) only renders
 * this and posts to the endpoints in submissions/payment-endpoints.
 *
 * Which buttons appear is decided by the SAME rules the server applies
 * (refusalFor and ADMIN_ONLY_ACTIONS from lib/place-payment-rules), so a
 * button is shown only when the server would accept it from this state. Client
 * safe: nothing here imports Payload or the transactional engine.
 */

// ---------------------------------------------------------------------------
// The business as the panel reads it (REST, depth 1, staff session)
// ---------------------------------------------------------------------------

export interface PanelUserRef {
  id?: number | string
  name?: string | null
  email?: string | null
}

export type PanelEntry = Omit<PaymentEntry, 'recordedBy' | 'voidedBy'> & {
  recordedBy?: number | string | PanelUserRef | null
  voidedBy?: number | string | PanelUserRef | null
}

export interface PanelHistoryLine {
  id?: string | null
  step?: string | null
  at?: string | null
  by?: number | string | PanelUserRef | null
  note?: string | null
}

export interface PanelDoc {
  id: number | string
  _status?: string | null
  listingNumber?: number | null
  /** The magazine issue (an id, or the issue itself at depth 1). */
  issue?: number | string | { id?: number | string | null } | null
  submission?: {
    status?: string | null
    ownerName?: string | null
    ownerEmail?: string | null
    ownerPhone?: string | null
    rejectionKind?: string | null
    payments?: PanelEntry[] | null
    history?: PanelHistoryLine[] | null
    terms?: { priceAtAcceptance?: number | null; currency?: string | null } | null
    payment?: {
      stage?: string | null
      price?: number | null
      downpaymentAmount?: number | null
      currency?: string | null
      downpaymentDueAt?: string | null
      balanceDueAt?: string | null
      submittedEmailSentAt?: string | null
      acceptedEmailSentAt?: string | null
      /** The number a lapse released, given back on a re-open. */
      lapsedListingNumber?: number | null
    } | null
  } | null
}

export interface PanelUser {
  roles?: unknown
}

const rolesOf = (user: PanelUser | null | undefined): string[] =>
  Array.isArray(user?.roles) ? (user.roles as unknown[]).filter((r) => typeof r === 'string') : []

export const isStaffRole = (user: PanelUser | null | undefined) =>
  rolesOf(user).some((r) => r === 'staff' || r === 'admin')
export const isAdminRole = (user: PanelUser | null | undefined) => rolesOf(user).includes('admin')

const priceOf = (doc: PanelDoc): number => {
  const p = doc.submission?.payment?.price
  if (typeof p === 'number' && Number.isFinite(p)) return p
  const t = doc.submission?.terms?.priceAtAcceptance
  return typeof t === 'number' && Number.isFinite(t) ? t : 0
}

export const currencyOf = (doc: PanelDoc) =>
  String(
    doc.submission?.payment?.currency ?? doc.submission?.terms?.currency ?? 'USD',
  ).toUpperCase()

const entriesOf = (doc: PanelDoc): PaymentEntry[] =>
  (doc.submission?.payments ?? []).map((e) => ({
    ...e,
    recordedBy: null,
    voidedBy: null,
  }))

/** The same view the engine builds (lib/place-payments viewOf). */
export function panelView(doc: PanelDoc): SubmissionView {
  return {
    status: (doc.submission?.status ?? null) as SubmissionStatus | null,
    stage: (doc.submission?.payment?.stage ?? 'none') as PaymentStage,
    published: doc._status === 'published',
    entries: entriesOf(doc),
    price: priceOf(doc),
  }
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export function statusWords(doc: PanelDoc): string {
  const s = doc.submission?.status
  const stage = doc.submission?.payment?.stage
  switch (s) {
    case 'incomplete':
      return 'Incomplete (the owner is still filling in the form)'
    case 'abandoned':
      return 'Abandoned (the form was left idle)'
    case 'awaiting_downpayment':
      return 'Awaiting downpayment'
    case 'pending':
      return stage === 'waived'
        ? 'In review (downpayment waived)'
        : 'In review (downpayment received)'
    case 'accepted':
      return 'Accepted, awaiting the rest'
    case 'paid':
      return 'Fully paid'
    case 'lapsed':
      return 'Lapsed (the downpayment was not paid in time)'
    case 'approved':
      return doc._status === 'published' ? 'Published' : 'Approved'
    case 'rejected':
      return doc.submission?.rejectionKind === 'unpaid'
        ? 'Rejected: did not pay the rest'
        : 'Rejected: not accepted'
    case 'expired':
      return 'Expired (the contract ended)'
    default:
      return 'Not a form submission'
  }
}

const STAGE_WORDS: Record<string, string> = {
  none: 'Nothing paid',
  downpayment_paid: 'Downpayment paid',
  waived: 'Downpayment waived',
  fully_paid: 'Fully paid',
  refund_due: 'Refund to send',
  refunded: 'Refunded',
  kept: 'Downpayment kept',
}

export const stageWords = (stage: unknown) =>
  STAGE_WORDS[typeof stage === 'string' ? stage : 'none'] ?? String(stage)

/** "24 Nov 2026, 14:30", in Lebanon's time. Empty for nothing. */
export function beirutDateTime(value: unknown, withTime = true): string {
  if (typeof value !== 'string' || !value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Asia/Beirut',
  })
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days from now to `due`, rounded up (due in 3 hours = 1 day left). */
export function daysLeft(due: string, now: Date): number {
  return Math.ceil((new Date(due).getTime() - now.getTime()) / DAY_MS)
}

export function daysLeftWords(days: number): string {
  if (days > 1) return `${days} days left`
  if (days === 1) return '1 day left'
  if (days === 0) return 'due now'
  return days === -1 ? 'overdue by 1 day' : `overdue by ${-days} days`
}

// ---------------------------------------------------------------------------
// Money summary
// ---------------------------------------------------------------------------

export interface MoneyFacts {
  currency: string
  price: number
  downpaymentExpected: number | null
  received: number
  refunded: number
  stillToPay: number
  /** What is still to be returned (received - refunded), only while a refund is due. */
  toRefund: number
  deadline: { label: string; at: string; days: number } | null
}

/**
 * The downpayment staff should expect: the amount copied when the form was
 * sent, else (older rows) the Settings percent of the price, exactly as the
 * engine counts it (lib/place-payments recordDownpayment). Null while the
 * percent is not known yet.
 */
export function expectedDownpayment(
  doc: PanelDoc,
  downpaymentPercent?: number | null,
): number | null {
  const copied = doc.submission?.payment?.downpaymentAmount
  if (typeof copied === 'number') return copied
  if (typeof downpaymentPercent !== 'number' || !Number.isFinite(downpaymentPercent)) return null
  return downpaymentFor(priceOf(doc), downpaymentPercent)
}

/**
 * The money summary. `downpaymentPercent` (Settings, from the public terms
 * route) is only used when the row has no copied downpayment amount.
 */
export function moneyFacts(
  doc: PanelDoc,
  now: Date,
  downpaymentPercent?: number | null,
): MoneyFacts {
  const view = panelView(doc)
  const { received, refunded, stillToPay } = summarise(view.entries, view.price)
  const p = doc.submission?.payment ?? {}
  const due =
    view.status === 'awaiting_downpayment'
      ? { label: 'Downpayment due', at: p.downpaymentDueAt }
      : view.status === 'accepted'
        ? { label: 'Rest due', at: p.balanceDueAt }
        : null
  const at = due?.at && !Number.isNaN(new Date(due.at).getTime()) ? due.at : null
  return {
    currency: currencyOf(doc),
    price: view.price,
    downpaymentExpected: expectedDownpayment(doc, downpaymentPercent),
    received,
    refunded,
    stillToPay,
    toRefund:
      view.stage === 'refund_due' ? Math.max(0, toCents(received) - toCents(refunded)) / 100 : 0,
    deadline: due && at ? { label: due.label, at, days: daysLeft(at, now) } : null,
  }
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export type PanelAction =
  | 'downpayment'
  | 'accept'
  | 'rejectNotAccepted'
  | 'balance'
  | 'rejectUnpaid'
  | 'refund'
  | 'extend'
  | 'resend'
  | 'waive'

/** In the order of the PRD table (page 5), per status. */
const ORDER: { key: PanelAction; rule: PaymentAction | null }[] = [
  { key: 'downpayment', rule: 'recordDownpayment' },
  { key: 'accept', rule: 'accept' },
  { key: 'balance', rule: 'recordBalance' },
  { key: 'refund', rule: 'recordRefundSent' },
  { key: 'resend', rule: null },
  { key: 'extend', rule: 'extendDeadline' },
  { key: 'rejectNotAccepted', rule: 'rejectNotAccepted' },
  { key: 'rejectUnpaid', rule: 'rejectUnpaid' },
  { key: 'waive', rule: 'waiveDownpayment' },
]

export const ACTION_LABELS: Record<PanelAction, string> = {
  downpayment: 'Downpayment received',
  accept: 'Accept',
  rejectNotAccepted: 'Reject: not accepted',
  balance: 'Balance received',
  rejectUnpaid: 'Reject: did not pay the rest',
  refund: 'Refund sent',
  extend: 'Extend deadline',
  resend: 'Resend email',
  waive: 'Waive downpayment',
}

/** Which "pay" email can be resent now (E1 or E3), or null. Same rule as the server. */
export function resendEvent(view: SubmissionView): 'E1' | 'E3' | null {
  if (view.published) return null
  if (view.status === 'awaiting_downpayment') return 'E1'
  if (view.status === 'accepted') return 'E3'
  return null
}

/** Which deadline "Extend deadline" moves in this state, or null. */
export function extendWhich(view: SubmissionView): 'downpayment' | 'balance' | null {
  if (view.published) return null
  if (view.status === 'awaiting_downpayment' || view.status === 'lapsed') return 'downpayment'
  if (view.status === 'accepted') return 'balance'
  return null
}

const hasOwnerEmail = (doc: PanelDoc) => Boolean(doc.submission?.ownerEmail?.trim())

const hasIssue = (doc: PanelDoc) => {
  const issue = doc.issue
  if (issue === null || issue === undefined || issue === '') return false
  return typeof issue === 'object' ? issue.id !== null && issue.id !== undefined : true
}

/**
 * Whether a lapsed submission can be re-opened: the server gives back the
 * number the lapse released, in its issue, so both must be on file (whether
 * another business took the number since is only known to the server).
 */
const canReopen = (doc: PanelDoc) =>
  typeof doc.submission?.payment?.lapsedListingNumber === 'number' && hasIssue(doc)

/**
 * The buttons for this business and this person: only those the server would
 * accept now (refusalFor plus the checks the server makes on the row: an owner
 * email to resend to, a number to give back on a re-open), and the admin-only
 * ones only for an admin. Anyone who is not staff gets none.
 */
export function panelActions(
  view: SubmissionView,
  user: PanelUser | null | undefined,
  doc: PanelDoc,
): PanelAction[] {
  if (!isStaffRole(user) || !view.status) return []
  const admin = isAdminRole(user)
  return ORDER.filter(({ key, rule }) => {
    if (key === 'resend') return resendEvent(view) !== null && hasOwnerEmail(doc)
    if (!rule) return false
    if (ADMIN_ONLY_ACTIONS.has(rule) && !admin) return false
    if (key === 'extend') {
      if (extendWhich(view) === null) return false
      if (view.status === 'lapsed' && !canReopen(doc)) return false
    }
    return refusalFor(rule, view) === null
  }).map(({ key }) => key)
}

/** Whether an admin may undo this one money line now (the server's own rule). */
export function canUndo(
  view: SubmissionView,
  entryId: string | null | undefined,
  user: PanelUser | null | undefined,
): boolean {
  if (!entryId || !isAdminRole(user)) return false
  if (refusalFor('undoMoneyEntry', view) !== null) return false
  return !isRefusal(afterUndo(view, entryId))
}

/** The plain line under the buttons about Payload's normal Publish. Null: say nothing. */
export function publishHint(doc: PanelDoc): string | null {
  if (doc._status === 'published') return null
  switch (doc.submission?.status) {
    case 'paid':
      return 'Fully paid: ready to publish.'
    case 'incomplete':
    case 'awaiting_downpayment':
    case 'pending':
    case 'accepted':
      return 'Cannot publish until fully paid.'
    case 'rejected':
    case 'lapsed':
    case 'abandoned':
      return 'Cannot be published: this submission is closed.'
    default:
      return null
  }
}

/**
 * Prompts that tell staff to resend an email, or that it went automatically.
 * A re-opened lapsed business is sent E1 again by the server itself (lead
 * decision e), so staff are told so rather than asked to send it twice.
 */
export function emailNotice(doc: PanelDoc): string | null {
  const s = doc.submission?.status
  const p = doc.submission?.payment ?? {}
  if (doc._status === 'published') return null
  const noEmail =
    'This submission has no owner email, so the payment emails cannot be sent. Contact the owner by phone.'
  if (s === 'awaiting_downpayment') {
    if (!p.submittedEmailSentAt) {
      if (!hasOwnerEmail(doc)) return noEmail
      return 'The "pay the downpayment" email (E1) has not gone out. Use Resend email.'
    }
    const last = [...(doc.submission?.history ?? [])].reverse()[0]
    if (last?.step === 'deadline_extended' && /^Re-opened/.test(last.note ?? '')) {
      return 'Re-opened: the "pay the downpayment" email (E1) was sent again automatically. Use Resend email only if the owner did not get it.'
    }
  }
  if (s === 'accepted' && !p.acceptedEmailSentAt) {
    if (!hasOwnerEmail(doc)) return noEmail
    return 'The "pay the rest" email (E3) has not gone out. Use Resend email.'
  }
  return null
}

/** Why Accept is missing on a submission in review, if it is. */
export function acceptBlocked(view: SubmissionView): string | null {
  if (view.status !== 'pending' || view.published) return null
  return refusalFor('accept', view)?.message ?? null
}

// ---------------------------------------------------------------------------
// Money forms
// ---------------------------------------------------------------------------

export type MoneyKind = 'downpayment' | 'balance' | 'refund'
export type MethodValue = 'whish' | 'desk' | 'cash'

export interface MoneyForm {
  amount: string
  method: MethodValue
  senderNumber: string
  /** datetime-local value, in Lebanon's time: 2026-11-24T14:30. Never prefilled. */
  whishAt: string
  note: string
}

const amountText = (n: number | null) => (n === null || !(n > 0) ? '' : String(n))

/** The amount staff expect for this form, or null when nothing is known. */
export function expectedAmount(
  kind: MoneyKind,
  doc: PanelDoc,
  downpaymentPercent?: number | null,
): number | null {
  const facts = moneyFacts(doc, new Date(0), downpaymentPercent)
  if (kind === 'downpayment') return facts.downpaymentExpected
  if (kind === 'balance') return facts.stillToPay
  const { received, refunded } = facts
  return Math.max(0, toCents(received) - toCents(refunded)) / 100
}

/**
 * The form as it opens: the amount expected, the sender from the owner's phone
 * (a refund goes back to the number the money came from). The Whish time is
 * left empty on purpose: a guessed time would defeat the duplicate check.
 */
export function moneyDefaults(
  kind: MoneyKind,
  doc: PanelDoc,
  downpaymentPercent?: number | null,
): MoneyForm {
  const entries = doc.submission?.payments ?? []
  const paidFrom = [...entries]
    .reverse()
    .find((e) => e.type !== 'refund' && e.voided !== true && e.senderNumber)?.senderNumber
  return {
    amount: amountText(expectedAmount(kind, doc, downpaymentPercent)),
    method: 'whish',
    senderNumber:
      (kind === 'refund' ? (paidFrom ?? doc.submission?.ownerPhone) : doc.submission?.ownerPhone) ??
      '',
    whishAt: '',
    note: '',
  }
}

export interface AmountCheck {
  /** Blocks sending. */
  error: string | null
  /** Allowed, but staff should look again. */
  warning: string | null
  noteRequired: boolean
}

/** What to say about the typed amount, against what is expected. */
export function checkAmount(
  kind: MoneyKind,
  typed: string,
  expected: number | null,
  currency: string,
): AmountCheck {
  const amount = parseAmount(typed)
  if (isRefusal(amount)) return { error: amount.message, warning: null, noteRequired: false }
  if (expected === null) {
    // The server compares a downpayment with the Settings percent when no
    // amount was copied; while that is not known here, ask for the note.
    return kind === 'downpayment'
      ? {
          error: null,
          warning:
            'The expected downpayment could not be read. Say in the note what was paid and why.',
          noteRequired: true,
        }
      : { error: null, warning: null, noteRequired: false }
  }
  const money = formatMoney(expected, currency)
  const less = toCents(amount) < toCents(expected)
  if (kind === 'refund') {
    if (!less && differsFromExpected(amount, expected)) {
      return {
        error: `That is more than the ${money} to return.`,
        warning: null,
        noteRequired: false,
      }
    }
    return less
      ? {
          error: null,
          warning: `Less than the ${money} to return: it stays in Refunds to send until the rest is sent.`,
          noteRequired: false,
        }
      : { error: null, warning: null, noteRequired: false }
  }
  if (!differsFromExpected(amount, expected))
    return { error: null, warning: null, noteRequired: false }
  if (kind === 'downpayment') {
    return {
      error: null,
      warning: `The expected downpayment is ${money}. A different amount is allowed: say why in the note.`,
      noteRequired: true,
    }
  }
  return {
    error: null,
    warning: less
      ? `Less than the ${money} still to pay: it stays Accepted, awaiting the rest. Say why in the note.`
      : `More than the ${money} still to pay. Say why in the note.`,
    noteRequired: true,
  }
}

/** Errors that block sending a money form, in the order staff fill it in. */
export function moneyFormError(
  kind: MoneyKind,
  form: MoneyForm,
  check: AmountCheck,
): string | null {
  if (check.error) return check.error
  if (form.method === 'whish') {
    if (kind !== 'refund' && !form.senderNumber.trim()) {
      return 'Write the number the money was sent from.'
    }
    if (!form.whishAt) return 'Write the date and time shown in Whish.'
    if (!beirutLocalToIso(form.whishAt)) return 'The Whish date and time could not be read.'
  }
  if (check.noteRequired && !form.note.trim()) return 'Add a note saying why the amount differs.'
  return null
}

/** The JSON body for /downpayment-received, /balance-received or /refund-sent. */
export function moneyBody(businessId: number | string, form: MoneyForm): Record<string, unknown> {
  const body: Record<string, unknown> = {
    businessId,
    amount: Number(form.amount.trim()),
    method: form.method,
  }
  if (form.senderNumber.trim()) body.senderNumber = form.senderNumber.trim()
  if (form.method === 'whish' && form.whishAt) body.whishAt = beirutLocalToIso(form.whishAt)
  if (form.note.trim()) body.note = form.note.trim()
  return body
}

// ---------------------------------------------------------------------------
// Lebanon's time <-> ISO with its offset
// ---------------------------------------------------------------------------

const ZONE = 'Asia/Beirut'

/** Minutes Lebanon is ahead of UTC at this instant (120 in winter, 180 in summer). */
export function beirutOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000)
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * "2026-11-24T14:30" typed as Lebanon's time -> "2026-11-24T14:30:00+02:00".
 * The server refuses a time without a zone, so the zone is always written.
 * Null when the text is not a date and time.
 */
export function beirutLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim())
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number]
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  if (Number.isNaN(wall)) return null
  let offset = beirutOffsetMinutes(new Date(wall))
  offset = beirutOffsetMinutes(new Date(wall - offset * 60000))
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** Now in Lebanon's time, as a datetime-local value (the latest a Whish time can be). */
export function beirutLocalNow(now: Date): string {
  const shifted = new Date(now.getTime() + beirutOffsetMinutes(now) * 60000)
  return shifted.toISOString().slice(0, 16)
}

/** The latest Whish time the form offers: the server allows 10 minutes ahead (phone clocks differ). */
export const whishTimeMax = (now: Date) => beirutLocalNow(new Date(now.getTime() + 10 * 60 * 1000))

// ---------------------------------------------------------------------------
// Money list and history
// ---------------------------------------------------------------------------

export const personName = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number' || typeof value === 'string') return `user ${value}`
  const ref = value as PanelUserRef
  return ref.name?.trim() || ref.email?.trim() || (ref.id !== undefined ? `user ${ref.id}` : '')
}

const TYPE_WORDS: Record<string, string> = {
  downpayment: 'Downpayment',
  balance: 'Rest of the price',
  refund: 'Refund',
}
const METHOD_WORDS: Record<string, string> = { whish: 'Whish', desk: 'At the desk', cash: 'Cash' }

export interface MoneyRow {
  id: string
  type: string
  amount: string
  method: string
  sender: string
  whishAt: string
  recorded: string
  note: string
  /** "Undone ..." or "Kept (did not pay the rest)", or empty. */
  mark: string
  voided: boolean
}

export function moneyRows(doc: PanelDoc): MoneyRow[] {
  const currency = currencyOf(doc)
  return (doc.submission?.payments ?? []).map((e, i) => {
    const who = personName(e.recordedBy)
    const when = beirutDateTime(e.recordedAt)
    const mark = e.voided
      ? [
          'Undone',
          personName(e.voidedBy) ? `by ${personName(e.voidedBy)}` : '',
          beirutDateTime(e.voidedAt) ? `on ${beirutDateTime(e.voidedAt)}` : '',
        ]
          .filter(Boolean)
          .join(' ') + (e.voidReason ? `: ${e.voidReason}` : '')
      : e.forfeited
        ? 'Kept (did not pay the rest)'
        : ''
    return {
      id: e.id ?? `row-${i}`,
      type: TYPE_WORDS[e.type] ?? e.type,
      amount: formatMoney(e.amount, e.currency ?? currency),
      method: METHOD_WORDS[e.method ?? 'whish'] ?? '',
      sender: e.senderNumber ?? '',
      whishAt: beirutDateTime(e.whishAt),
      recorded: [who, when].filter(Boolean).join(', '),
      note: e.note ?? '',
      mark,
      voided: e.voided === true,
    }
  })
}

const HIDDEN_STEPS = new Set(['incomplete', 'abandoned'])

export interface HistoryRow {
  key: string
  label: string
  at: string
  by: string
  note: string
}

/** The payment and review steps, oldest first, with labels from the history field. */
export function historyRows(doc: PanelDoc, labels: Record<string, string>): HistoryRow[] {
  return (doc.submission?.history ?? [])
    .filter((h) => h.step && !HIDDEN_STEPS.has(h.step))
    .map((h, i) => ({
      key: h.id ?? `h-${i}`,
      label: labels[h.step as string] ?? String(h.step),
      at: beirutDateTime(h.at),
      by: personName(h.by),
      note: h.note ?? '',
    }))
}

// ---------------------------------------------------------------------------
// Answers from the server
// ---------------------------------------------------------------------------

const CODE_WORDS: Record<string, string> = {
  'not-staff': 'Only staff can do this.',
  'not-admin': 'Only an admin can do this.',
  'not-found': 'This business was not found. Reload the page.',
  'bad-input': 'Check the form and try again.',
  'wrong-state': 'This is not possible in the current status. Reload the page.',
  published: 'This listing is published. Set it to Draft first.',
  'duplicate-payment': 'This Whish transfer is already recorded. Check the number and the time.',
  'number-taken': 'That page number is taken by another business. The owner must send a new form.',
  'no-price': 'This submission has no price on file. Ask an admin.',
  changed: 'Someone changed this business at the same moment. Reload the page and try again.',
  error: 'It could not be saved. Try again in a moment.',
}

/** The plain sentence to show for a refusal: the server's own, or one for its code. */
export function refusalWords(body: unknown, httpStatus: number): string {
  const b = (body ?? {}) as { error?: unknown; code?: unknown }
  if (typeof b.error === 'string' && b.error.trim()) return b.error
  if (typeof b.code === 'string' && CODE_WORDS[b.code]) return CODE_WORDS[b.code]!
  if (httpStatus === 401 || httpStatus === 403) return CODE_WORDS['not-staff']!
  return 'It did not go through. Try again in a moment.'
}
