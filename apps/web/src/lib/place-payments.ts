import { randomBytes } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'

import { isStaffUser } from '../access/index'
import {
  ENGINE_HISTORY_KEY,
  type EngineHistory,
  type HistoryStep,
} from '../hooks/recordSubmissionHistory'
import { runInTransaction } from './branches'
import { advisoryLock, placeSubmissionLockKey } from './partner-lock'
import { notifyAfterChange, type PaymentEvent } from './place-payment-notify'
import {
  ADMIN_ONLY_ACTIONS,
  addDays,
  afterAccept,
  afterBalance,
  afterUndo,
  differsFromExpected,
  downpaymentFor,
  findDuplicateTransfer,
  forfeitReceived,
  formatMoney,
  hasLiveDownpayment,
  isRefusal,
  parseAmount,
  parseDays,
  parseMethod,
  parseNote,
  parseReason,
  parseSender,
  parseWhishAt,
  refusalFor,
  refuse,
  stageAfterNotAccepted,
  stageAfterRefund,
  summarise,
  toCents,
  type PaymentAction,
  type PaymentEntry,
  type PaymentMethod,
  type PaymentStage,
  type Refusal,
  type RefusalCode,
  type SubmissionStatus,
  type SubmissionView,
} from './place-payment-rules'
import { getPlaceSettings } from './place-settings'
import { isListingNumberTaken } from './place-submission'
import { reportError } from './report'

/**
 * The payment engine of the Magazine Places form (spec v4, 24 November 2026):
 * the ONLY code that changes a submission's status, payment stage, money lines
 * and rejection kind after the owner sent the form. The fields are closed to
 * every API (collections/Businesses `engineAccess`); this writes them with
 * overrideAccess.
 *
 * Every action works the same way:
 *
 * 1. The role is checked first (staff or admin; some actions admin only; the
 *    jobs act as the system for lapse and did-not-pay), then the input, before
 *    anything is read.
 * 2. In one transaction, under the submission's advisory lock (the same one
 *    finish and the abandon job take), the business is read again, the rules
 *    (lib/place-payment-rules) say whether the action may happen in this state
 *    and what it leads to, and one write saves it, claimed on the status that
 *    was read (a change that slipped in without the lock loses, nothing is
 *    overwritten).
 * 3. The write appends to the submission history (who, when, what) through
 *    hooks/recordSubmissionHistory, and frees the page number when the new
 *    status gives it back (hooks/releaseListingNumber).
 * 4. Only after the transaction committed, the payment email for the event is
 *    asked for (lib/place-payment-notify), and nothing it does can undo or
 *    block the change.
 *
 * A Whish transfer (sender number and time) is recorded once across ALL
 * businesses: checked under a second, global lock taken after the
 * submission's (always in that order, so two actions cannot deadlock). The
 * check is in code because the development databases are built by push, not
 * by the migrations, and so may lack any index.
 *
 * Refusals are plain sentences with a stable `code`, for the admin to show.
 */

export const WHISH_TRANSFER_LOCK_KEY = 'vardenia.place-payments.whish-transfers'

export type Actor = { user: unknown } | { system: 'job' }

type EmailLanguage = 'en' | 'ar'

export type PaymentOutcome =
  | {
      ok: true
      status: SubmissionStatus
      stage: PaymentStage
      received: number
      stillToPay: number
      /** Extra facts of one action (reject: whether a refund is due). */
      answer?: Record<string, unknown>
    }
  | { ok: false; status: number; code: RefusalCode; message: string }

const HTTP: Record<RefusalCode, number> = {
  'not-staff': 403,
  'not-admin': 403,
  'not-found': 404,
  'bad-input': 400,
  'wrong-state': 409,
  published: 409,
  'duplicate-payment': 409,
  'number-taken': 409,
  'no-price': 409,
  changed: 409,
  error: 500,
}

const fail = (r: Refusal): PaymentOutcome => ({
  ok: false,
  status: HTTP[r.code],
  code: r.code,
  message: r.message,
})

const isAdminUser = (user: unknown) =>
  isStaffUser(user) && ((user as { roles?: unknown }).roles as string[]).includes('admin')

/** Actions a scheduled job may take without a signed-in person. */
const SYSTEM_ACTIONS: ReadonlySet<PaymentAction> = new Set([
  'lapseUnpaidDownpayment',
  'rejectUnpaid',
])

interface PaymentSummaryDoc {
  stage?: PaymentStage | null
  price?: number | null
  downpaymentAmount?: number | null
  currency?: string | null
  received?: number | null
  refunded?: number | null
  stillToPay?: number | null
  downpaymentDueAt?: string | null
  balanceDeadlineDays?: number | null
  balanceDueAt?: string | null
  lapsedListingNumber?: number | null
  [key: string]: unknown
}

export interface BusinessDoc {
  id: number
  name?: unknown
  _status?: unknown
  issue?: unknown
  listingNumber?: unknown
  submission?: {
    status?: SubmissionStatus | null
    ownerPhone?: string | null
    payments?: PaymentEntry[] | null
    payment?: PaymentSummaryDoc | null
    terms?: { priceAtAcceptance?: number | null; currency?: string | null } | null
    [key: string]: unknown
  } | null
}

const priceOf = (b: BusinessDoc) => {
  const p = b.submission?.payment?.price
  if (typeof p === 'number' && Number.isFinite(p)) return p
  const t = b.submission?.terms?.priceAtAcceptance
  return typeof t === 'number' && Number.isFinite(t) ? t : 0
}

const currencyOf = (b: BusinessDoc) =>
  String(b.submission?.payment?.currency ?? b.submission?.terms?.currency ?? 'USD').toUpperCase()

export function viewOf(b: BusinessDoc): SubmissionView {
  return {
    status: (b.submission?.status ?? null) as SubmissionStatus | null,
    stage: (b.submission?.payment?.stage ?? 'none') as PaymentStage,
    published: b._status === 'published',
    entries: (b.submission?.payments ?? []) as PaymentEntry[],
    price: priceOf(b),
  }
}

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' ? id : null
}

/** Same shape as Payload's own array row ids (24 hex characters). */
const newRowId = () => randomBytes(12).toString('hex')

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Beirut',
  })

/** What one action decided, for runAction to write. */
interface Plan {
  status?: SubmissionStatus
  stage?: PaymentStage
  entries?: PaymentEntry[]
  /** Fields of the payment summary to set (besides the money totals). */
  payment?: Record<string, unknown>
  /** Other submission fields to set. */
  submission?: Record<string, unknown>
  /** Top-level business fields (the page number on a re-open). */
  business?: Record<string, unknown>
  history: { step: HistoryStep; note?: string }[]
  events?: PaymentEvent[]
  /** Run after the commit, never throws into the action (the plain rejection email). */
  after?: () => Promise<void>
  /** Extra answer fields. */
  answer?: Record<string, unknown>
}

interface PlanContext {
  payload: Payload
  req: PayloadRequest
  business: BusinessDoc
  view: SubmissionView
  now: Date
  by: number | string | null
}

/** The role check, first of all, before the input is even read. */
function roleRefusal(actor: Actor, action: PaymentAction): PaymentOutcome | null {
  if ('system' in actor) {
    return SYSTEM_ACTIONS.has(action) ? null : fail(refuse('not-staff', 'Staff only.'))
  }
  if (!isStaffUser(actor.user)) return fail(refuse('not-staff', 'Staff only.'))
  if (ADMIN_ONLY_ACTIONS.has(action) && !isAdminUser(actor.user)) {
    return fail(refuse('not-admin', 'Only an admin can do this.'))
  }
  return null
}

async function runAction(
  args: {
    payload: Payload
    actor: Actor
    businessId: unknown
    action: PaymentAction
    now?: Date
    /** The owner's email language chosen by staff ('en' or 'ar'); else guessed. */
    locale?: EmailLanguage
  },
  plan: (ctx: PlanContext) => Promise<Plan | Refusal>,
): Promise<PaymentOutcome> {
  const { payload, actor, action } = args
  const now = args.now ?? new Date()

  const denied = roleRefusal(actor, action)
  if (denied) return denied
  const by = 'system' in actor ? null : (actor.user as { id: number | string }).id

  const id = Number(args.businessId)
  if (!Number.isInteger(id) || id <= 0) {
    return fail(refuse('bad-input', 'Choose a business first.'))
  }

  // Set when the write gives a page number back (a re-open), so a refusal of
  // that number by the database reads as number-taken, not as a failure.
  let givesNumber = false
  try {
    const done = await runInTransaction(payload, async (req) => {
      await advisoryLock(req as PayloadRequest, placeSubmissionLockKey(id))
      const business = (await payload
        .findByID({ collection: 'businesses', id, depth: 0, req, overrideAccess: true })
        .catch(() => null)) as BusinessDoc | null
      if (!business?.submission) return refuse('not-found', 'That business was not found.')

      const view = viewOf(business)
      const refusal = refusalFor(action, view)
      if (refusal) return refusal

      const decided = await plan({ payload, req: req as PayloadRequest, business, view, now, by })
      if (isRefusal(decided)) return decided
      givesNumber = decided.business?.listingNumber !== undefined

      const entries = decided.entries ?? [...view.entries]
      const money = summarise(entries, view.price)
      const status = decided.status ?? (view.status as SubmissionStatus)
      const stage = decided.stage ?? view.stage
      const history: EngineHistory = { entries: decided.history, by }

      const result = await payload.update({
        collection: 'businesses',
        where: {
          and: [{ id: { equals: id } }, { 'submission.status': { equals: view.status } }],
        },
        // Only the keys this action changes. Payload fills every key left out
        // from the row as it reads it inside this update (field-level
        // beforeValidate, getFallbackValue), group by group, so an admin edit
        // to another field (the terms, the owner's details) that committed
        // after our read is kept instead of being written back over.
        data: {
          ...decided.business,
          submission: {
            ...decided.submission,
            status,
            ...(decided.entries ? { payments: entries } : {}),
            payment: {
              ...decided.payment,
              stage,
              received: money.received,
              refunded: money.refunded,
              stillToPay: money.stillToPay,
            },
          },
        } as never,
        depth: 0,
        req,
        overrideAccess: true,
        context: {
          skipAutoTranslate: true,
          skipQrGeneration: true,
          [ENGINE_HISTORY_KEY]: history,
        },
      })
      if (result.errors?.length) {
        // Thrown so the transaction is rolled back; the errors ride along for the catch.
        throw Object.assign(
          new Error(`The change could not be saved: ${JSON.stringify(result.errors)}`),
          { updateErrors: result.errors },
        )
      }
      if (result.docs.length === 0) {
        return refuse(
          'changed',
          'This submission changed while you were looking at it. Reload and check it.',
        )
      }
      const listingNumber =
        typeof business.listingNumber === 'number' ? business.listingNumber : null
      return { decided, status, stage, money, listingNumber }
    })

    if (isRefusal(done)) return fail(done)

    // Committed. Emails and the like from here on can never undo it.
    for (const event of done.decided.events ?? []) {
      // The number read under the lock: a rejection or a lapse released it.
      await notifyAfterChange(event, {
        payload,
        businessId: id,
        listingNumber: done.listingNumber,
        now,
        ...(args.locale ? { locale: args.locale } : {}),
      })
    }
    if (done.decided.after) {
      await done.decided.after().catch(async (error) => {
        await reportError(error, {
          source: `place-payments.${action}.after`,
          extra: { listingId: id },
        })
      })
    }
    return {
      ok: true,
      status: done.status,
      stage: done.stage,
      received: done.money.received,
      stillToPay: done.money.stillToPay,
      ...(done.decided.answer ? { answer: done.decided.answer } : {}),
    }
  } catch (error) {
    if (givesNumber && numberRefused(error)) {
      // A new form took the number between the check and the write (the
      // start service holds no lock per number; the unique index decides).
      return fail(
        refuse(
          'number-taken',
          'That page number was just taken by another business. The owner must send a new form.',
        ),
      )
    }
    await reportError(error, { source: `place-payments.${action}`, extra: { listingId: id } })
    return fail(
      refuse('error', 'The change could not be saved. Try again, or check Errors in the admin.'),
    )
  }
}

/**
 * The page number refused by the write: thrown (lib/place-submission
 * isListingNumberTaken), or collected by Payload's update-by-where, which
 * keeps only each error's message ("... invalid: issue_id, listing_number" for
 * the unique index, "... invalid: Listing number" for the field's validation).
 */
function numberRefused(error: unknown): boolean {
  if (isListingNumberTaken(error)) return true
  const collected = (error as { updateErrors?: { message?: unknown }[] } | null)?.updateErrors
  return (
    Array.isArray(collected) &&
    collected.some((e) => typeof e?.message === 'string' && /listing[ _]?number/i.test(e.message))
  )
}

// ---------------------------------------------------------------------------
// Money lines
// ---------------------------------------------------------------------------

export interface MoneyInput {
  amount?: unknown
  senderNumber?: unknown
  whishAt?: unknown
  method?: unknown
  note?: unknown
}

interface ParsedMoney {
  amount: number
  senderNumber: string | null
  whishAt: string | null
  method: PaymentMethod
  note: string
}

/** Validates a money line. A Whish payment needs its sender and time. */
export function parseMoney(
  input: MoneyInput,
  now: Date,
  options: { senderRequired?: boolean } = {},
): ParsedMoney | Refusal {
  const amount = parseAmount(input.amount)
  if (isRefusal(amount)) return amount
  const method = parseMethod(input.method)
  if (isRefusal(method)) return method
  const whish = method === 'whish'
  const senderNumber = parseSender(input.senderNumber, whish && options.senderRequired !== false)
  if (isRefusal(senderNumber)) return senderNumber
  const whishAt = parseWhishAt(input.whishAt, whish, now)
  if (isRefusal(whishAt)) return whishAt
  const note = parseNote(input.note)
  if (isRefusal(note)) return note
  return { amount, senderNumber, whishAt, method, note }
}

/**
 * Refuses a transfer already recorded on any business (this one included).
 * Takes the global transfer lock first; the caller already holds the
 * submission's lock, so the order is always submission, then transfers.
 */
async function refuseDuplicateTransfer(
  ctx: PlanContext,
  sender: string | null,
  whishAt: string | null,
): Promise<Refusal | null> {
  if (!sender || !whishAt) return null
  await advisoryLock(ctx.req, WHISH_TRANSFER_LOCK_KEY)
  const found = await ctx.payload.find({
    collection: 'businesses',
    where: { 'submission.payments.senderNumber': { equals: sender } },
    depth: 0,
    limit: 0,
    pagination: false,
    trash: true,
    overrideAccess: true,
    req: ctx.req,
  })
  const candidates: { id: number; entries: readonly PaymentEntry[] }[] = (
    found.docs as unknown as BusinessDoc[]
  ).map((b) => ({
    id: b.id,
    entries: (b.id === ctx.business.id
      ? ctx.view.entries
      : (b.submission?.payments ?? [])) as PaymentEntry[],
  }))
  if (!candidates.some((c) => c.id === ctx.business.id)) {
    candidates.push({ id: ctx.business.id, entries: ctx.view.entries })
  }
  const dup = findDuplicateTransfer(candidates, sender, whishAt)
  if (!dup) return null
  return refuse(
    'duplicate-payment',
    dup.businessId === ctx.business.id
      ? `This Whish transfer (from ${sender} at ${whishAt}) is already recorded on this submission.`
      : `This Whish transfer (from ${sender} at ${whishAt}) is already recorded on listing ${String(dup.businessId)}. Check the number and the time.`,
  )
}

const entryOf = (
  type: PaymentEntry['type'],
  m: ParsedMoney,
  ctx: PlanContext,
  currency: string,
): PaymentEntry => ({
  id: newRowId(),
  type,
  amount: m.amount,
  currency,
  senderNumber: m.senderNumber,
  whishAt: m.whishAt,
  method: m.method,
  note: m.note || null,
  recordedBy: ctx.by,
  recordedAt: ctx.now.toISOString(),
  voided: false,
  forfeited: false,
})

/**
 * The history line of a money entry: amount, method and the staff note. Never
 * the sender number (usually the owner's own phone): the history holds no
 * owner details, and the number is on the money line itself.
 */
const moneyNote = (m: ParsedMoney, currency: string) =>
  [
    formatMoney(m.amount, currency),
    m.method === 'whish' ? 'by Whish' : m.method === 'desk' ? 'at the desk' : 'in cash',
    m.note ? `(${m.note})` : '',
  ]
    .filter(Boolean)
    .join(' ')

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface ActionArgs {
  payload: Payload
  actor: Actor
  businessId: unknown
  now?: Date
}

/** Downpayment received (staff): awaiting_downpayment -> pending, stage downpayment_paid. E2. */
export async function recordDownpayment(args: ActionArgs & MoneyInput) {
  const denied = roleRefusal(args.actor, 'recordDownpayment')
  if (denied) return denied
  const now = args.now ?? new Date()
  const money = parseMoney(args, now)
  if (isRefusal(money)) return fail(money)
  return runAction({ ...args, now, action: 'recordDownpayment' }, async (ctx) => {
    const currency = currencyOf(ctx.business)
    // The amount copied when the form was sent; the settings for older rows.
    const expected =
      ctx.business.submission?.payment?.downpaymentAmount ??
      downpaymentFor(
        ctx.view.price,
        (await getPlaceSettings(ctx.payload, ctx.req)).downpaymentPercent,
      )
    if (differsFromExpected(money.amount, expected) && !money.note) {
      return refuse(
        'bad-input',
        `The amount differs from the expected ${formatMoney(expected, currency)}. Add a note saying why.`,
      )
    }
    const dup = await refuseDuplicateTransfer(ctx, money.senderNumber, money.whishAt)
    if (dup) return dup
    return {
      status: 'pending',
      stage: 'downpayment_paid',
      entries: [...ctx.view.entries, entryOf('downpayment', money, ctx, currency)],
      history: [{ step: 'downpayment_received', note: moneyNote(money, currency) }],
      events: ['E2'],
    }
  })
}

async function acceptPlan(ctx: PlanContext): Promise<Plan> {
  // The deadline copied when the form was sent; the settings for older rows.
  const snap = ctx.business.submission?.payment?.balanceDeadlineDays
  const days =
    typeof snap === 'number' && Number.isInteger(snap) && snap > 0
      ? snap
      : (await getPlaceSettings(ctx.payload, ctx.req)).balanceDeadlineDays
  const { status, stage } = afterAccept(ctx.view.entries, ctx.view.price, ctx.view.stage)
  const due = status === 'paid' ? null : addDays(ctx.now, days).toISOString()
  const { stillToPay } = summarise(ctx.view.entries, ctx.view.price)
  const currency = currencyOf(ctx.business)
  const note = due
    ? `${formatMoney(stillToPay, currency)} still to pay by ${dayLabel(due)}`
    : 'Fully paid'
  return {
    status,
    stage,
    submission: { acceptedAt: ctx.now.toISOString() },
    payment: { balanceDueAt: due },
    history: [{ step: 'accepted', note }],
    // Already covered by the downpayment: the owner is told there is nothing more to pay.
    events: status === 'paid' ? ['E3paid'] : ['E3'],
  }
}

/** Accept (staff): pending with the downpayment recorded or waived -> accepted, rest due. E3. */
export async function acceptSubmission(args: ActionArgs) {
  return runAction({ ...args, action: 'accept' }, acceptPlan)
}

export const MAX_REASON_LENGTH = 1000

/**
 * Reject: not accepted (staff, reason required): from pending,
 * awaiting_downpayment or incomplete. The page number is released. Money
 * received -> stage refund_due and E5; nothing received -> the plain
 * rejection email (lib/place-rejection sends it, through `after`).
 */
export async function rejectNotAccepted(
  args: ActionArgs & {
    reason?: unknown
    shareReason?: unknown
    /** Staff's choice of the owner's email language: 'en' or 'ar'; anything else is guessed. */
    locale?: unknown
    /** Sends the plain rejection email; given by lib/place-rejection. */
    plainEmail?: (business: BusinessDoc) => Promise<void>
  },
) {
  const denied = roleRefusal(args.actor, 'rejectNotAccepted')
  if (denied) return denied
  const reason = parseReason(args.reason, 'Write the reason for the rejection first.')
  if (isRefusal(reason)) return fail(reason)
  const shareReason = args.shareReason === true
  // E5 honours the language staff chose, like the plain rejection email.
  const locale = args.locale === 'ar' || args.locale === 'en' ? args.locale : undefined
  return runAction({ ...args, locale, action: 'rejectNotAccepted' }, async (ctx) => {
    const stage = stageAfterNotAccepted(ctx.view.entries, ctx.view.price)
    const refund = stage === 'refund_due'
    return {
      status: 'rejected',
      stage,
      submission: {
        rejectionKind: 'not_accepted',
        rejectionReason: reason,
        rejectionReasonShared: shareReason,
        rejectedAt: ctx.now.toISOString(),
        rejectedBy: ctx.by,
      },
      history: [{ step: 'rejected', note: `Not accepted: ${reason}` }],
      events: refund ? ['E5'] : [],
      ...(!refund && args.plainEmail ? { after: () => args.plainEmail!(ctx.business) } : {}),
      answer: { refundDue: refund },
    }
  })
}

/** Refund sent (staff): rejected with a refund due. Refunded once all went back. */
export async function recordRefundSent(args: ActionArgs & MoneyInput) {
  const now = args.now ?? new Date()
  return runAction({ ...args, now, action: 'recordRefundSent' }, async (ctx) => {
    const { received, refunded } = summarise(ctx.view.entries, ctx.view.price)
    const owed = Math.max(0, toCents(received) - toCents(refunded)) / 100
    // The amount defaults to what is still to be returned, the number to the
    // one the downpayment came from.
    const paidFrom = [...ctx.view.entries]
      .reverse()
      .find((e) => e.type !== 'refund' && e.voided !== true)
    const money = parseMoney(
      {
        ...args,
        amount: args.amount ?? owed,
        senderNumber: args.senderNumber ?? paidFrom?.senderNumber ?? undefined,
      },
      now,
      { senderRequired: false },
    )
    if (isRefusal(money)) return money
    if (toCents(money.amount) > toCents(owed)) {
      return refuse(
        'bad-input',
        `That is more than what is to be returned (${formatMoney(owed, currencyOf(ctx.business))}).`,
      )
    }
    const currency = currencyOf(ctx.business)
    const entries = [...ctx.view.entries, entryOf('refund', money, ctx, currency)]
    return {
      stage: stageAfterRefund(entries, ctx.view.price),
      entries,
      history: [
        {
          step: 'refund_sent',
          note: moneyNote(money, currency),
        },
      ],
    }
  })
}

/** Payment of the rest (staff): accepted only. Fully paid at the price; less needs a note. */
export async function recordBalance(args: ActionArgs & MoneyInput) {
  const denied = roleRefusal(args.actor, 'recordBalance')
  if (denied) return denied
  const now = args.now ?? new Date()
  const money = parseMoney(args, now)
  if (isRefusal(money)) return fail(money)
  return runAction({ ...args, now, action: 'recordBalance' }, async (ctx) => {
    const currency = currencyOf(ctx.business)
    const entries = [...ctx.view.entries, entryOf('balance', money, ctx, currency)]
    // First: without a price nothing can be counted (never read as fully paid).
    const counted = afterBalance(entries, ctx.view.price)
    if (isRefusal(counted)) return counted
    const { status, summary } = counted
    const { stillToPay } = summarise(ctx.view.entries, ctx.view.price)
    if (differsFromExpected(money.amount, stillToPay) && !money.note) {
      return refuse(
        'bad-input',
        `The amount differs from the ${formatMoney(stillToPay, currency)} still to pay. Add a note saying why.`,
      )
    }
    const dup = await refuseDuplicateTransfer(ctx, money.senderNumber, money.whishAt)
    if (dup) return dup
    return {
      status,
      stage: status === 'paid' ? 'fully_paid' : ctx.view.stage,
      entries,
      history: [
        {
          step: 'balance_received',
          note: `${moneyNote(money, currency)}. ${status === 'paid' ? 'Fully paid' : `${formatMoney(summary.stillToPay, currency)} still to pay`}`,
        },
      ],
    }
  })
}

/**
 * Rejected: did not pay the rest. By staff at any time (reason optional), or
 * by the job once the deadline passed. What was received is kept (stage
 * kept), the number released. E6.
 */
export async function rejectUnpaid(args: ActionArgs & { reason?: unknown }) {
  const denied = roleRefusal(args.actor, 'rejectUnpaid')
  if (denied) return denied
  const reason = parseNote(args.reason, 'reason')
  if (isRefusal(reason)) return fail(reason)
  return runAction({ ...args, action: 'rejectUnpaid' }, async (ctx) => {
    if ('system' in args.actor) {
      const due = ctx.business.submission?.payment?.balanceDueAt
      if (!due || new Date(due).getTime() > ctx.now.getTime()) {
        return refuse('wrong-state', 'The deadline for the rest has not passed yet.')
      }
    }
    const { entries, stage } = forfeitReceived(ctx.view.entries)
    const text = reason || 'The rest of the price was not paid by the deadline.'
    return {
      status: 'rejected',
      stage,
      entries,
      submission: {
        rejectionKind: 'unpaid',
        rejectionReason: text,
        rejectionReasonShared: false,
        rejectedAt: ctx.now.toISOString(),
        rejectedBy: ctx.by,
      },
      history: [{ step: 'rejected', note: `Did not pay the rest: ${text}` }],
      events: ['E6'],
    }
  })
}

/** Lapsed (job): the downpayment deadline passed. Number released and remembered. E7. */
export async function lapseUnpaidDownpayment(args: Omit<ActionArgs, 'actor'>) {
  return runAction(
    { ...args, actor: { system: 'job' }, action: 'lapseUnpaidDownpayment' },
    async (ctx) => {
      const due = ctx.business.submission?.payment?.downpaymentDueAt
      if (!due || new Date(due).getTime() > ctx.now.getTime()) {
        return refuse('wrong-state', 'The downpayment deadline has not passed yet.')
      }
      const number = ctx.business.listingNumber
      return {
        status: 'lapsed',
        payment: { lapsedListingNumber: typeof number === 'number' ? number : null },
        history: [{ step: 'lapsed', note: `Downpayment not received by ${dayLabel(due)}` }],
        events: ['E7'],
      }
    },
  )
}

/** Waive the downpayment (admin, reason): awaiting_downpayment -> pending, stage waived. */
export async function waiveDownpayment(args: ActionArgs & { reason?: unknown }) {
  const denied = roleRefusal(args.actor, 'waiveDownpayment')
  if (denied) return denied
  const reason = parseReason(args.reason)
  if (isRefusal(reason)) return fail(reason)
  return runAction({ ...args, action: 'waiveDownpayment' }, async () => ({
    status: 'pending',
    stage: 'waived',
    history: [{ step: 'downpayment_waived', note: reason }],
  }))
}

/**
 * Undo one money line (admin, reason). The line stays, voided with who, when
 * and why; the status and stage step back (lib/place-payment-rules afterUndo).
 * Refused once the listing is approved (published).
 */
export async function undoMoneyEntry(args: ActionArgs & { entryId?: unknown; reason?: unknown }) {
  const denied = roleRefusal(args.actor, 'undoMoneyEntry')
  if (denied) return denied
  const reason = parseReason(args.reason)
  if (isRefusal(reason)) return fail(reason)
  if (typeof args.entryId !== 'string' || !args.entryId || args.entryId.length > 64) {
    return fail(refuse('bad-input', 'Choose the money line to undo.'))
  }
  const entryId = args.entryId
  return runAction({ ...args, action: 'undoMoneyEntry' }, async (ctx) => {
    const undone = afterUndo(ctx.view, entryId)
    if (isRefusal(undone)) return undone
    const entries = ctx.view.entries.map((e) =>
      e.id === entryId
        ? {
            ...e,
            voided: true,
            voidedBy: ctx.by,
            voidedAt: ctx.now.toISOString(),
            voidReason: reason,
          }
        : e,
    )
    const currency = currencyOf(ctx.business)
    const kind =
      undone.entry.type === 'downpayment'
        ? 'Downpayment'
        : undone.entry.type === 'balance'
          ? 'Payment of the rest'
          : 'Refund'
    const deadline = await deadlineAfterUndo(ctx, undone.status)
    return {
      status: undone.status,
      stage: undone.stage,
      entries,
      ...(deadline ? { payment: deadline.payment } : {}),
      history: [
        {
          step: 'payment_undone',
          note: `${kind} of ${formatMoney(undone.entry.amount, currency)} undone: ${reason}`,
        },
        ...(deadline ? [deadline.line] : []),
      ],
    }
  })
}

/**
 * When an undo steps the status back (pending -> awaiting_downpayment, or
 * paid -> accepted) and that stage's deadline already passed (or was never
 * set: accepted straight to paid leaves no balanceDueAt), a fresh deadline
 * from today, and its reminder may go again. Otherwise the lapse or did-not-pay
 * job would close it on its next run, against an owner who did pay.
 */
async function deadlineAfterUndo(
  ctx: PlanContext,
  next: SubmissionStatus,
): Promise<{ payment: Record<string, unknown>; line: Plan['history'][number] } | null> {
  const p = ctx.business.submission?.payment ?? {}
  const passed = (due: unknown) => {
    const t = typeof due === 'string' ? new Date(due).getTime() : Number.NaN
    return !Number.isFinite(t) || t <= ctx.now.getTime()
  }
  if (ctx.view.status === 'pending' && next === 'awaiting_downpayment') {
    if (!passed(p.downpaymentDueAt)) return null
    const days = (await getPlaceSettings(ctx.payload, ctx.req)).downpaymentDeadlineDays
    const due = addDays(ctx.now, days).toISOString()
    return {
      payment: { downpaymentDueAt: due, downpaymentReminderSentAt: null },
      line: {
        step: 'deadline_extended',
        note: `Downpayment deadline had passed: now due ${dayLabel(due)}`,
      },
    }
  }
  if (ctx.view.status === 'paid' && next === 'accepted') {
    if (!passed(p.balanceDueAt)) return null
    // The deadline copied when the form was sent; the settings for older rows.
    const snap = p.balanceDeadlineDays
    const days =
      typeof snap === 'number' && Number.isInteger(snap) && snap > 0
        ? snap
        : (await getPlaceSettings(ctx.payload, ctx.req)).balanceDeadlineDays
    const due = addDays(ctx.now, days).toISOString()
    return {
      payment: { balanceDueAt: due, balanceReminderSentAt: null },
      line: {
        step: 'deadline_extended',
        note: `Deadline for the rest had passed: now due ${dayLabel(due)}`,
      },
    }
  }
  return null
}

/**
 * Extend a deadline (staff and admin, reason): the downpayment's (also
 * re-opens a lapsed submission, only while its page number is still free) or
 * the rest's. The days are added to the deadline, or to today when it already
 * passed. A reminder already sent (E1c, E4) is not sent again: its marker is
 * left as it is. Only a re-open of a lapsed submission sets the markers anew.
 */
export async function extendDeadline(
  args: ActionArgs & { which?: unknown; days?: unknown; reason?: unknown },
) {
  const denied = roleRefusal(args.actor, 'extendDeadline')
  if (denied) return denied
  const reason = parseReason(args.reason)
  if (isRefusal(reason)) return fail(reason)
  const days = parseDays(args.days)
  if (isRefusal(days)) return fail(days)
  if (args.which !== 'downpayment' && args.which !== 'balance') {
    return fail(refuse('bad-input', 'Choose which deadline to extend: downpayment or the rest.'))
  }
  const which = args.which
  return runAction({ ...args, action: 'extendDeadline' }, async (ctx) => {
    const s = ctx.view.status
    const p = ctx.business.submission?.payment ?? {}
    const from = (due: unknown) => {
      const t = typeof due === 'string' ? new Date(due).getTime() : Number.NaN
      return new Date(Number.isFinite(t) ? Math.max(t, ctx.now.getTime()) : ctx.now.getTime())
    }

    if (which === 'balance') {
      if (s !== 'accepted') {
        return refuse('wrong-state', 'Only the deadline of an accepted submission can be extended.')
      }
      const due = addDays(from(p.balanceDueAt), days).toISOString()
      return {
        // The reminder marker is kept: a reminder already sent (E4) is not sent again.
        payment: { balanceDueAt: due },
        history: [
          {
            step: 'deadline_extended',
            note: `Rest: +${days} days, now ${dayLabel(due)}. ${reason}`,
          },
        ],
      }
    }

    if (s === 'awaiting_downpayment') {
      const due = addDays(from(p.downpaymentDueAt), days).toISOString()
      return {
        // The reminder marker is kept: a reminder already sent (E1c) is not sent again.
        payment: { downpaymentDueAt: due },
        history: [
          {
            step: 'deadline_extended',
            note: `Downpayment: +${days} days, now ${dayLabel(due)}. ${reason}`,
          },
        ],
      }
    }
    if (s !== 'lapsed') {
      return refuse('wrong-state', 'The downpayment deadline runs only while it is awaited.')
    }

    // Re-open a lapsed submission: its old number, if nobody took it since.
    const number = p.lapsedListingNumber
    const issue = idOf(ctx.business.issue)
    if (typeof number !== 'number' || issue === null) {
      return refuse(
        'number-taken',
        'This submission no longer has a page number to give back. The owner must send a new form.',
      )
    }
    const held = await ctx.payload.find({
      collection: 'businesses',
      where: {
        and: [
          { issue: { equals: issue } },
          { listingNumber: { equals: number } },
          { id: { not_equals: ctx.business.id } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req: ctx.req,
    })
    if (held.docs.length > 0) {
      return refuse(
        'number-taken',
        `Page number ${number} was taken by another business since. The owner must send a new form.`,
      )
    }
    const due = addDays(ctx.now, days).toISOString()
    // The owner was told (E7) the place is gone, so they are sent E1 again
    // ("pay the downpayment"): its marker is cleared for this case only, and
    // the email asked for after the commit. The day-5 reminder (E1c) counts
    // from the first sending, long past by now, so it is marked done here:
    // otherwise the next job run would send it right after E1.
    return {
      status: 'awaiting_downpayment',
      stage: hasLiveDownpayment(ctx.view.entries) ? ctx.view.stage : 'none',
      business: { listingNumber: number },
      payment: {
        downpaymentDueAt: due,
        downpaymentReminderSentAt: ctx.now.toISOString(),
        submittedEmailSentAt: null,
        lapsedEmailSentAt: null,
        lapsedListingNumber: null,
      },
      history: [
        {
          step: 'deadline_extended',
          note: `Re-opened with page number ${number}: downpayment now due ${dayLabel(due)}. ${reason}`,
        },
      ],
      events: ['E1'],
    }
  })
}
