import type { Payload } from 'payload'
import type { Locale } from '@vardenia/i18n'

import { siteOrigin } from './auth-email'
import { MAX_REASON_LENGTH, rejectNotAccepted } from './place-payments'
import { placeRejectionEmail } from './place-submission-email'
import { reportError } from './report'

/**
 * The Reject action for a submitted business (staff and admin only): "Reject:
 * not accepted" of the two-stage payment (spec v4). The state change itself
 * is lib/place-payments `rejectNotAccepted` (lock, re-read, one claimed
 * write, history, number released, rejectionKind not_accepted, stage
 * refund_due when a downpayment was received). This module keeps the endpoint's
 * answer shape and sends the plain rejection email when nothing was paid.
 *
 * Allowed from `pending` (in review), `awaiting_downpayment` and `incomplete`;
 * every other state is refused with a plain message, and a published listing
 * can never be rejected. A reason is required. The owner is told the reason
 * only if staff ticked "share the reason". When money was received, the owner
 * gets the "not accepted, refund coming" email (E5, lib/place-payment-notify)
 * instead, and the submission waits in Refunds to send.
 *
 * The emails are best effort: the rejection stands whatever happens to them.
 */

export { MAX_REASON_LENGTH }

export type RejectOutcome =
  | { ok: true; emailed: boolean; refundDue: boolean }
  | {
      ok: false
      status: 400 | 403 | 404 | 409 | 500
      code: string
      message: string
    }

export interface RejectArgs {
  payload: Payload
  /** req.user, as Payload resolved it from the session. */
  user: unknown
  businessId: unknown
  reason: unknown
  shareReason?: unknown
  /** 'ar' or 'en'; anything else is chosen from the owner's name. */
  locale?: unknown
}

const ARABIC = /[؀-ۿ]/

interface BusinessDoc {
  id?: unknown
  name?: unknown
  _status?: unknown
  submission?: {
    status?: string | null
    reference?: string | null
    ownerName?: string | null
    ownerEmail?: string | null
  } | null
}

export async function rejectSubmission(args: RejectArgs): Promise<RejectOutcome> {
  const { payload } = args
  const reason = typeof args.reason === 'string' ? args.reason.trim() : ''
  const shareReason = args.shareReason === true
  let emailed = false
  const outcome = await rejectNotAccepted({
    payload,
    actor: { user: args.user },
    businessId: args.businessId,
    reason: args.reason,
    shareReason,
    locale: args.locale,
    plainEmail: async (business) => {
      emailed = await sendRejection({
        payload,
        business: business as BusinessDoc,
        reason,
        shareReason,
        locale: args.locale,
        listingId: Number(args.businessId),
      })
    },
  })
  if (!outcome.ok) {
    return {
      ok: false,
      status: outcome.status as 400 | 403 | 404 | 409 | 500,
      code: outcome.code,
      message: outcome.message,
    }
  }
  return { ok: true, emailed, refundDue: outcome.answer?.refundDue === true }
}

async function sendRejection(args: {
  payload: Payload
  business: BusinessDoc
  reason: string
  shareReason: boolean
  locale: unknown
  listingId: number
}): Promise<boolean> {
  const { payload, business, listingId } = args
  // A form the owner never sent (still incomplete when staff rejected it) gets
  // no email: they submitted nothing, so there is nothing to turn down. Its
  // number is simply released. `business` is the listing as it was before the
  // rejection.
  if (business.submission?.status === 'incomplete') return false
  const to = business.submission?.ownerEmail
  if (!to) return false
  try {
    const ownerName = String(business.submission?.ownerName ?? '')
    const locale: Locale =
      args.locale === 'ar' || args.locale === 'en'
        ? args.locale
        : ARABIC.test(ownerName)
          ? 'ar'
          : 'en'
    const email = placeRejectionEmail({
      ownerName,
      businessName: String(business.name ?? ''),
      reference: String(business.submission?.reference ?? ''),
      reason: args.reason,
      shareReason: args.shareReason,
      locale,
      origin: siteOrigin(),
    })
    await payload.sendEmail({ to, subject: email.subject, html: email.html, text: email.text })
    return true
  } catch (error) {
    await reportError(error, { source: 'place-rejection.email', extra: { listingId } })
    return false
  }
}
