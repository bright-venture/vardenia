import type { Payload } from 'payload'

import { sendPaymentEmail, type EmailResult, type NotifyBusiness } from './place-payment-notify'
import { lapseUnpaidDownpayment, rejectUnpaid, type PaymentOutcome } from './place-payments'
import { addDays } from './place-payment-rules'
import { getPlaceSettings, type PlaceSettings } from './place-settings'
import { reportError } from './report'

/**
 * The timed side of the two-stage payment (spec v4), run every 15 minutes by
 * netlify/functions/place-payment-jobs.mts through POST
 * /booking/place-payment-jobs. Each run:
 *
 *  (a) lapses a submission still awaiting its downpayment once
 *      `downpaymentDueAt` has come (E7, number released);
 *  (b) reminds the owner of the downpayment once, `downpaymentReminderDay`
 *      days after the form was sent (E1c), while it is still awaited;
 *  (c) reminds the owner of the rest once, `balanceReminderDaysBefore` days
 *      before `balanceDueAt` (E4), while the submission is accepted;
 *  (d) rejects an accepted submission whose `balanceDueAt` has come ("did
 *      not pay the rest", E6, number released, downpayment kept);
 *  (e) sends E8 ("your place is published") to a listing published from the
 *      paid flow whose email never went out. The publish hook asks for it
 *      after the commit (hooks/linkPartnerOnPublish notifyPublished), but a
 *      serverless function may be frozen before that runs; this sweep is the
 *      safety net. Only listings approved, published, stage fully_paid (set
 *      by the engine alone, so never an older listing) and whose contract
 *      started within the last `E8_SWEEP_DAYS` days, so old partners are never
 *      emailed out of the blue. The marker (publishedEmailSentAt) makes it
 *      idempotent with the hook.
 *
 * The list is read without a lock; every action then works from a fresh read
 * under the submission's own advisory lock (the engine's actions, and
 * sendPaymentEmail for the reminders), so a business whose state or deadline
 * changed in between (paid, extended, rejected by staff) is left alone. The
 * markers make a second run send nothing. One business failing never stops
 * the others; it is reported and counted.
 *
 * The downpayment reminder is counted from `submittedAt` (from the deadline
 * minus its days for a row without one). An extension clears its marker
 * (lib/place-payments extendDeadline), so after one the reminder goes again on
 * the next run, while the new deadline is still ahead.
 */

export interface PaymentJobsResult {
  lapsed: number
  rejectedUnpaid: number
  downpaymentReminders: number
  balanceReminders: number
  /** E8 sent by the sweep (published, never emailed). */
  publishedEmails: number
  /** Found due, but changed meanwhile (or already done): nothing to do. */
  skipped: number
  /** Could not be handled; retried on the next run. */
  failed: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** How far back the E8 sweep looks, from the contract start (the publish day). */
export const E8_SWEEP_DAYS = 7

/** E8 still fits a sweep: published from the paid flow, recently, never emailed. */
export function publishedEmailDue(b: NotifyBusiness, now: Date): boolean {
  if (b._status !== 'published' || b.submission?.status !== 'approved') return false
  if (b.submission?.payment?.stage !== 'fully_paid') return false
  if (b.submission?.payment?.publishedEmailSentAt) return false
  const started = timeOf(b.contractStartsAt)
  return started !== null && started >= now.getTime() - E8_SWEEP_DAYS * DAY_MS
}

const timeOf = (value: unknown): number | null => {
  if (typeof value !== 'string' || !value) return null
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : null
}

/** When the one downpayment reminder (E1c) is due, or null for none. */
export function downpaymentReminderAt(b: NotifyBusiness, settings: PlaceSettings): number | null {
  if (settings.downpaymentReminderDay <= 0) return null
  const due = timeOf(b.submission?.payment?.downpaymentDueAt)
  const sent = timeOf(b.submission?.submittedAt)
  const from = sent ?? (due === null ? null : due - settings.downpaymentDeadlineDays * DAY_MS)
  return from === null ? null : addDays(new Date(from), settings.downpaymentReminderDay).getTime()
}

/** When the one reminder of the rest (E4) is due, or null for none. */
export function balanceReminderAt(b: NotifyBusiness, settings: PlaceSettings): number | null {
  if (settings.balanceReminderDaysBefore <= 0) return null
  const due = timeOf(b.submission?.payment?.balanceDueAt)
  return due === null ? null : due - settings.balanceReminderDaysBefore * DAY_MS
}

/** E1c fits: still awaited, the reminder time has come, the deadline has not. */
export function downpaymentReminderDue(
  b: NotifyBusiness,
  settings: PlaceSettings,
  now: Date,
): boolean {
  if (b.submission?.status !== 'awaiting_downpayment') return false
  const at = downpaymentReminderAt(b, settings)
  const due = timeOf(b.submission?.payment?.downpaymentDueAt)
  return at !== null && due !== null && now.getTime() >= at && now.getTime() < due
}

/** E4 fits: accepted, the reminder time has come, the deadline has not. */
export function balanceReminderDue(b: NotifyBusiness, settings: PlaceSettings, now: Date): boolean {
  if (b.submission?.status !== 'accepted') return false
  const at = balanceReminderAt(b, settings)
  const due = timeOf(b.submission?.payment?.balanceDueAt)
  return at !== null && due !== null && now.getTime() >= at && now.getTime() < due
}

const passed = (value: unknown, now: Date) => {
  const t = timeOf(value)
  return t !== null && now.getTime() >= t
}

export async function runPaymentJobs(args: {
  payload: Payload
  now?: Date
}): Promise<PaymentJobsResult> {
  const { payload } = args
  const now = args.now ?? new Date()
  const settings = await getPlaceSettings(payload)
  const result: PaymentJobsResult = {
    lapsed: 0,
    rejectedUnpaid: 0,
    downpaymentReminders: 0,
    balanceReminders: 0,
    publishedEmails: 0,
    skipped: 0,
    failed: 0,
  }

  const found = await payload.find({
    collection: 'businesses',
    where: { 'submission.status': { in: ['awaiting_downpayment', 'accepted'] } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  const engine = (outcome: PaymentOutcome, count: 'lapsed' | 'rejectedUnpaid') => {
    if (outcome.ok) result[count]++
    else if (outcome.code === 'error') result.failed++
    else result.skipped++
  }
  const email = (
    r: EmailResult,
    count: 'downpaymentReminders' | 'balanceReminders' | 'publishedEmails',
  ) => {
    if (r === 'sent') result[count]++
    else if (r === 'failed') result.failed++
    else result.skipped++
  }

  const report = (error: unknown, businessId: unknown) =>
    reportError(error, {
      source: 'place-payment-jobs',
      level: 'warning',
      extra: { listingId: businessId },
    }).catch(() => {})

  for (const b of found.docs as unknown as NotifyBusiness[]) {
    const businessId = (b as NotifyBusiness | null)?.id
    try {
      if (typeof businessId !== 'number') throw new Error('listed business has no id')
      const payment = b.submission?.payment ?? {}
      if (b.submission?.status === 'awaiting_downpayment') {
        if (passed(payment.downpaymentDueAt, now)) {
          engine(await lapseUnpaidDownpayment({ payload, businessId, now }), 'lapsed')
        } else if (!payment.downpaymentReminderSentAt && downpaymentReminderDue(b, settings, now)) {
          email(
            await sendPaymentEmail(
              'E1c',
              { payload, businessId, now },
              { guard: (fresh, at) => downpaymentReminderDue(fresh, settings, at) },
            ),
            'downpaymentReminders',
          )
        }
      } else if (b.submission?.status === 'accepted') {
        if (passed(payment.balanceDueAt, now)) {
          engine(
            await rejectUnpaid({ payload, actor: { system: 'job' }, businessId, now }),
            'rejectedUnpaid',
          )
        } else if (!payment.balanceReminderSentAt && balanceReminderDue(b, settings, now)) {
          email(
            await sendPaymentEmail(
              'E4',
              { payload, businessId, now },
              { guard: (fresh, at) => balanceReminderDue(fresh, settings, at) },
            ),
            'balanceReminders',
          )
        }
      }
    } catch (error) {
      result.failed++
      await report(error, businessId)
    }
  }

  // (e) E8 that never went out. A failed listing query is reported and
  // counted, and does not undo what (a) to (d) did above.
  try {
    const published = await payload.find({
      collection: 'businesses',
      where: {
        and: [
          { _status: { equals: 'published' } },
          { 'submission.status': { equals: 'approved' } },
          { 'submission.payment.stage': { equals: 'fully_paid' } },
          { 'submission.payment.publishedEmailSentAt': { exists: false } },
          {
            contractStartsAt: {
              greater_than_equal: new Date(now.getTime() - E8_SWEEP_DAYS * DAY_MS).toISOString(),
            },
          },
        ],
      },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    for (const b of published.docs as unknown as NotifyBusiness[]) {
      const businessId = (b as NotifyBusiness | null)?.id
      try {
        if (typeof businessId !== 'number') throw new Error('listed business has no id')
        // The query is not trusted alone: checked again here, and under the
        // lock by sendPaymentEmail (the marker, and the guard).
        if (!publishedEmailDue(b, now)) continue
        email(
          await sendPaymentEmail(
            'E8',
            { payload, businessId, now },
            { guard: (fresh, at) => publishedEmailDue(fresh, at) },
          ),
          'publishedEmails',
        )
      } catch (error) {
        result.failed++
        await report(error, businessId)
      }
    }
  } catch (error) {
    result.failed++
    await report(error, null)
  }
  return result
}
