import type { Payload, PayloadRequest } from 'payload'
import type { Locale } from '@vardenia/i18n'

import { isStaffUser } from '../access/index'
import { ENGINE_HISTORY_KEY, type EngineHistory } from '../hooks/recordSubmissionHistory'
import { siteOrigin } from './auth-email'
import { runInTransaction } from './branches'
import { advisoryLock, placeSubmissionLockKey } from './partner-lock'
import { paymentEmail, unpaidTeamEmail, type EmailLocale } from './place-payment-email'
import { hasLiveDownpayment, summarise, type PaymentEntry } from './place-payment-rules'
import { getPlaceSettings } from './place-settings'
import { teamAlertAddress } from './place-submission-email'
import { reportError } from './report'

/**
 * The payment emails of the Magazine Places form (spec v4, Task 10).
 *
 * - E1  sent by the owner: pay the downpayment (owner). It REPLACES the first
 *       version's owner confirmation: finish sends only the team alert (E1b).
 * - E1c downpayment reminder (owner, job)
 * - E2  downpayment received, in review (owner)
 * - E3  accepted: pay the rest (owner)
 * - E3paid accepted, and the downpayment already covers the price: nothing
 *       more to pay (owner; shares E3's marker, never resent)
 * - E4  reminder before the deadline for the rest (owner, job)
 * - E5  not accepted: the downpayment is being returned (owner)
 * - E6  did not pay the rest: rejected (owner and team)
 * - E7  lapsed: downpayment not paid in time (owner)
 * - E8  published: congratulations (owner; the partner account's set-password
 *       email is separate and unchanged)
 *
 * The wording is lib/place-payment-email. Each email goes out at most once:
 * under the submission's lock (the engine's), the business is read again, the
 * event must still fit its state, and its marker on `submission.payment`
 * (`*EmailSentAt`, `*ReminderSentAt`) must be empty. The email is sent, then
 * the marker stamped in the same transaction, so a failed send leaves it empty
 * and a later try may send it. Asking twice sends once. Staff may resend E1 or
 * E3 on purpose (resendPaymentEmail), which is logged in the history.
 *
 * Callers call this only AFTER their change committed (never inside a
 * transaction that holds the submission's lock: it takes that lock itself),
 * and through `notifyAfterChange`, which never throws: an email can never undo
 * or block a state change.
 */

export type PaymentEvent = 'E1' | 'E1c' | 'E2' | 'E3' | 'E3paid' | 'E4' | 'E5' | 'E6' | 'E7' | 'E8'

export const PAYMENT_EVENTS: readonly PaymentEvent[] = [
  'E1',
  'E1c',
  'E2',
  'E3',
  'E3paid',
  'E4',
  'E5',
  'E6',
  'E7',
  'E8',
]

/** The field on `submission.payment` that says when each email went out. */
export const EMAIL_MARKERS: Record<PaymentEvent, string> = {
  E1: 'submittedEmailSentAt',
  E1c: 'downpaymentReminderSentAt',
  E2: 'downpaymentEmailSentAt',
  E3: 'acceptedEmailSentAt',
  E3paid: 'acceptedEmailSentAt',
  E4: 'balanceReminderSentAt',
  E5: 'notAcceptedEmailSentAt',
  E6: 'unpaidEmailSentAt',
  E7: 'lapsedEmailSentAt',
  E8: 'publishedEmailSentAt',
}

export interface PaymentNotifyContext {
  payload: Payload
  businessId: number
  /** Language the owner used, when known (the form's locale). */
  locale?: Locale
  /**
   * The page number the business held before this change. Rejecting and
   * lapsing release it in the same write, so the email would otherwise have
   * none to show.
   */
  listingNumber?: number | null
  now?: Date
}

export interface NotifyBusiness {
  id: number
  name?: unknown
  _status?: unknown
  listingNumber?: unknown
  contractStartsAt?: unknown
  contractEndsAt?: unknown
  submission?: {
    status?: string | null
    reference?: string | null
    ownerName?: string | null
    ownerEmail?: string | null
    submittedAt?: string | null
    rejectionKind?: string | null
    rejectionReason?: string | null
    rejectionReasonShared?: boolean | null
    payments?: PaymentEntry[] | null
    payment?: Record<string, unknown> | null
    terms?: { priceAtAcceptance?: number | null; currency?: string | null } | null
    [key: string]: unknown
  } | null
}

/** Whether the event still fits the business as it is now. */
const FITS: Record<PaymentEvent, (b: NotifyBusiness) => boolean> = {
  E1: (b) => b.submission?.status === 'awaiting_downpayment',
  E1c: (b) => b.submission?.status === 'awaiting_downpayment',
  E2: (b) =>
    ['pending', 'accepted', 'paid'].includes(String(b.submission?.status)) &&
    hasLiveDownpayment(b.submission?.payments ?? []),
  E3: (b) => b.submission?.status === 'accepted',
  E3paid: (b) => b.submission?.status === 'paid',
  E4: (b) => b.submission?.status === 'accepted',
  E5: (b) =>
    b.submission?.status === 'rejected' &&
    b.submission?.rejectionKind === 'not_accepted' &&
    ['refund_due', 'refunded'].includes(String(b.submission?.payment?.stage)),
  E6: (b) => b.submission?.status === 'rejected' && b.submission?.rejectionKind === 'unpaid',
  E7: (b) => b.submission?.status === 'lapsed',
  E8: (b) => b.submission?.status === 'approved' && b._status === 'published',
}

export type EmailResult =
  /** Sent now (and the marker stamped). */
  | 'sent'
  /** Already sent once (marker set); nothing done. */
  | 'already-sent'
  /** The business is gone, or its state no longer fits the event. */
  | 'not-applicable'
  /** Nobody to send it to (no owner email). */
  | 'no-recipient'
  /** The send failed; the marker is left empty so it may be tried again. */
  | 'failed'

const ARABIC = /[؀-ۿ]/

/** The form's language when known, else Arabic for an Arabic name, else English. */
export function emailLocaleFor(locale: unknown, ownerName: string): EmailLocale {
  if (locale === 'ar' || locale === 'en') return locale
  if (locale) return 'en'
  return ARABIC.test(ownerName) ? 'ar' : 'en'
}

const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const dateOf = (v: unknown) => (typeof v === 'string' && v ? v : null)

const pageNumberOf = (b: NotifyBusiness, hint: number | null | undefined): number | null => {
  if (typeof b.listingNumber === 'number') return b.listingNumber
  if (typeof hint === 'number') return hint
  const lapsed = b.submission?.payment?.lapsedListingNumber
  return typeof lapsed === 'number' ? lapsed : null
}

interface SendOptions {
  /** Resend: send even when the marker is set. */
  force?: boolean
  /** An extra condition read under the lock (a job's time window). */
  guard?: (b: NotifyBusiness, now: Date) => boolean
  /** A history line to add in the marker's write (resend). */
  history?: EngineHistory
}

/**
 * Sends the email of one event at most once (see the module comment). Never
 * throws: a failure is reported and answered 'failed'.
 */
export async function sendPaymentEmail(
  event: PaymentEvent,
  ctx: PaymentNotifyContext,
  options: SendOptions = {},
): Promise<EmailResult> {
  const { payload, businessId } = ctx
  const now = ctx.now ?? new Date()
  const marker = EMAIL_MARKERS[event]
  try {
    const settings = await getPlaceSettings(payload)
    return await runInTransaction(payload, async (req) => {
      await advisoryLock(req as PayloadRequest, placeSubmissionLockKey(businessId))
      const b = (await payload
        .findByID({ collection: 'businesses', id: businessId, depth: 0, req, overrideAccess: true })
        .catch(() => null)) as NotifyBusiness | null
      const submission = b?.submission
      if (!b || !submission) return 'not-applicable'
      if (!FITS[event](b)) return 'not-applicable'
      if (options.guard && !options.guard(b, now)) return 'not-applicable'
      const payment = submission.payment ?? {}
      if (!options.force && payment[marker]) return 'already-sent'

      const ownerName = String(submission.ownerName ?? '')
      const price = num(payment.price, num(submission.terms?.priceAtAcceptance))
      const money = summarise(submission.payments ?? [], price)
      const facts = {
        locale: emailLocaleFor(ctx.locale, ownerName),
        ownerName,
        businessName: String(b.name ?? ''),
        reference: String(submission.reference ?? ''),
        pageNumber: pageNumberOf(b, ctx.listingNumber),
        price,
        downpaymentAmount: num(payment.downpaymentAmount),
        received: money.received,
        refunded: money.refunded,
        stillToPay: money.stillToPay,
        currency: String(payment.currency ?? submission.terms?.currency ?? 'USD'),
        downpaymentDueAt: dateOf(payment.downpaymentDueAt),
        balanceDueAt: dateOf(payment.balanceDueAt),
        // The days copied when the form was sent; the Settings for older rows.
        balanceDeadlineDays:
          typeof payment.balanceDeadlineDays === 'number' &&
          Number.isInteger(payment.balanceDeadlineDays) &&
          payment.balanceDeadlineDays > 0
            ? payment.balanceDeadlineDays
            : settings.balanceDeadlineDays,
        contractEndsAt: dateOf(b.contractEndsAt),
        sharedReason:
          submission.rejectionReasonShared === true
            ? String(submission.rejectionReason ?? '').trim() || null
            : null,
        whishNumber: settings.whishNumber,
        origin: siteOrigin(),
        businessId,
        now: now.toISOString(),
      }

      const to = submission.ownerEmail
      const team = event === 'E6' ? teamAlertAddress() : null
      if (!to && !team) return 'no-recipient'

      let ownerSent = false
      let teamSent = false
      if (to) {
        try {
          const email = paymentEmail(event, facts)
          await payload.sendEmail({
            to,
            subject: email.subject,
            html: email.html,
            text: email.text,
          })
          ownerSent = true
        } catch (error) {
          await reportError(error, {
            source: 'place-payment.email',
            level: 'warning',
            extra: { event, listingId: businessId },
          }).catch(() => {})
        }
      }
      if (team) {
        try {
          const email = unpaidTeamEmail(facts)
          await payload.sendEmail({
            to: team,
            subject: email.subject,
            html: email.html,
            text: email.text,
          })
          teamSent = true
        } catch (error) {
          await reportError(error, {
            source: 'place-payment.email.team',
            level: 'warning',
            extra: { event, listingId: businessId },
          }).catch(() => {})
        }
      }
      // The marker follows the owner's copy (the team's when there is no
      // owner email): a failed owner send stays retryable.
      if (!(to ? ownerSent : teamSent)) return 'failed'

      const result = await payload.update({
        collection: 'businesses',
        where: {
          and: [
            { id: { equals: businessId } },
            { 'submission.status': { equals: submission.status } },
          ],
        },
        // The marker only: Payload fills every other key from the row as it
        // reads it inside this update (field-level beforeValidate), so an admin
        // edit that committed while the email was being sent is not undone.
        data: { submission: { payment: { [marker]: now.toISOString() } } } as never,
        depth: 0,
        req,
        overrideAccess: true,
        context: {
          skipAutoTranslate: true,
          skipQrGeneration: true,
          ...(options.history ? { [ENGINE_HISTORY_KEY]: options.history } : {}),
        },
      })
      if (result.errors?.length || result.docs.length === 0) {
        // The email is out; only the marker is missing.
        throw new Error(`The email marker could not be saved: ${JSON.stringify(result.errors)}`)
      }
      return 'sent'
    })
  } catch (error) {
    await reportError(error, {
      source: 'place-payment.notify',
      level: 'warning',
      extra: { event, listingId: businessId },
    }).catch(() => {})
    return 'failed'
  }
}

/** The email of an event, once (see sendPaymentEmail). */
export async function notifyPaymentEvent(
  event: PaymentEvent,
  ctx: PaymentNotifyContext,
): Promise<void> {
  const result = await sendPaymentEmail(event, ctx)
  ctx.payload.logger?.info?.(
    { event, businessId: ctx.businessId, result },
    `place payment email ${event}: ${result}`,
  )
}

/** Calls notifyPaymentEvent and swallows (reports) any failure. */
export async function notifyAfterChange(
  event: PaymentEvent,
  ctx: PaymentNotifyContext,
): Promise<void> {
  try {
    await notifyPaymentEvent(event, ctx)
  } catch (error) {
    await reportError(error, {
      source: 'place-payment.notify',
      level: 'warning',
      extra: { event, businessId: ctx.businessId },
    }).catch(() => {})
  }
}

export const RESENDABLE: ReadonlySet<PaymentEvent> = new Set(['E1', 'E3'])

export type ResendOutcome =
  | { ok: true }
  | {
      ok: false
      status: 400 | 403 | 409 | 500
      code: 'not-staff' | 'bad-input' | 'wrong-state' | 'error'
      message: string
    }

/**
 * Resend E1 (pay the downpayment) or E3 (pay the rest), staff and admin.
 * Allowed only while that payment is awaited; changes no status, only stamps
 * the marker again and adds a history line (who, which email).
 */
export async function resendPaymentEmail(args: {
  payload: Payload
  user: unknown
  businessId: unknown
  event: unknown
  now?: Date
}): Promise<ResendOutcome> {
  if (!isStaffUser(args.user)) {
    return { ok: false, status: 403, code: 'not-staff', message: 'Staff only.' }
  }
  const id = Number(args.businessId)
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, status: 400, code: 'bad-input', message: 'Choose a business first.' }
  }
  if (typeof args.event !== 'string' || !RESENDABLE.has(args.event as PaymentEvent)) {
    return {
      ok: false,
      status: 400,
      code: 'bad-input',
      message: 'Only the "pay the downpayment" (E1) or "pay the rest" (E3) email can be resent.',
    }
  }
  const event = args.event as 'E1' | 'E3'
  const by = (args.user as { id?: number | string }).id ?? null
  const result = await sendPaymentEmail(
    event,
    { payload: args.payload, businessId: id, now: args.now },
    {
      force: true,
      history: {
        entries: [
          {
            step: 'email_resent',
            note:
              event === 'E1'
                ? 'Email resent: pay the downpayment (E1)'
                : 'Email resent: pay the rest (E3)',
          },
        ],
        by,
      },
    },
  )
  if (result === 'sent') return { ok: true }
  if (result === 'not-applicable') {
    return {
      ok: false,
      status: 409,
      code: 'wrong-state',
      message:
        event === 'E1'
          ? 'This email can be resent only while the downpayment is awaited.'
          : 'This email can be resent only while the rest of the price is awaited.',
    }
  }
  if (result === 'no-recipient') {
    return {
      ok: false,
      status: 409,
      code: 'wrong-state',
      message: 'This submission has no owner email to send to.',
    }
  }
  return {
    ok: false,
    status: 500,
    code: 'error',
    message: 'The email could not be sent. Try again, or check Errors in the admin.',
  }
}
