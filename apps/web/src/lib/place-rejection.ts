import type { Payload } from 'payload'
import type { Locale } from '@vardenia/i18n'

import { isStaffUser } from '../access/index'
import { siteOrigin } from './auth-email'
import { placeRejectionEmail } from './place-submission-email'
import { reportError } from './report'

/**
 * The Reject action for a submitted business (staff and admin only).
 *
 * Allowed from `pending` (finished by the owner, waiting for staff) and
 * `incomplete` (still being filled in) only; every other state is refused with
 * a plain message, and a published listing can never be rejected (its number
 * would be given away while the page is live; hooks/linkPartnerOnPublish
 * refuses it as well). A reason is required. It is stored on the submission
 * (staff only) with who and when, and the owner is told only if staff ticked
 * "share the reason".
 *
 * The change is one write claimed with the current status in its where clause,
 * so two staff rejecting at once, or a finish arriving at the same moment,
 * cannot both win. Setting the status to rejected frees the listing number in
 * the same write (hooks/releaseListingNumber) and appends to the history
 * (hooks/recordSubmissionHistory). The business stays a draft.
 *
 * The owner email is best effort: the rejection stands whatever happens to it.
 */

export const MAX_REASON_LENGTH = 1000

export type RejectOutcome =
  | { ok: true; emailed: boolean }
  | {
      ok: false
      status: 400 | 403 | 404 | 409 | 500
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

const REJECTABLE = ['pending', 'incomplete']

const fail = (status: 400 | 403 | 404 | 409 | 500, message: string): RejectOutcome => ({
  ok: false,
  status,
  message,
})

const ARABIC = /[؀-ۿ]/

interface BusinessDoc {
  name?: unknown
  _status?: unknown
  submission?: {
    status?: string
    reference?: string
    ownerName?: string
    ownerEmail?: string
  } | null
}

export async function rejectSubmission(args: RejectArgs): Promise<RejectOutcome> {
  const { payload, user } = args
  if (!isStaffUser(user)) return fail(403, 'Staff only.')

  const id = Number(args.businessId)
  if (!Number.isInteger(id) || id <= 0) return fail(400, 'Choose a business to reject.')

  const reason = typeof args.reason === 'string' ? args.reason.trim() : ''
  if (!reason) return fail(400, 'Write the reason for the rejection first.')
  if (reason.length > MAX_REASON_LENGTH) {
    return fail(400, `Keep the reason under ${MAX_REASON_LENGTH} characters.`)
  }
  const shareReason = args.shareReason === true

  try {
    const business = (await payload
      .findByID({ collection: 'businesses', id, depth: 0, overrideAccess: true })
      .catch(() => null)) as BusinessDoc | null
    if (!business) return fail(404, 'That business was not found.')

    const status = business.submission?.status
    if (business._status === 'published') {
      return fail(
        409,
        'A published listing cannot be rejected. Set the listing to Draft first, then reject it.',
      )
    }
    if (!status || !REJECTABLE.includes(status)) {
      return fail(
        409,
        status === 'rejected'
          ? 'This submission was already rejected.'
          : 'Only a submission that is waiting for review, or one still being filled in, can be rejected.',
      )
    }

    const now = new Date().toISOString()
    const userId = (user as { id: number }).id
    const result = await payload.update({
      collection: 'businesses',
      where: {
        and: [{ id: { equals: id } }, { 'submission.status': { in: REJECTABLE } }],
      },
      data: {
        submission: {
          ...business.submission,
          status: 'rejected',
          rejectionReason: reason,
          rejectionReasonShared: shareReason,
          rejectedAt: now,
          rejectedBy: userId,
        },
      } as never,
      depth: 0,
      user: user as never,
      overrideAccess: true,
      context: { skipAutoTranslate: true, skipQrGeneration: true },
    })
    if (result.errors?.length) {
      throw new Error(`The rejection could not be saved: ${JSON.stringify(result.errors)}`)
    }
    if (result.docs.length === 0) {
      return fail(409, 'This submission changed while you were looking at it. Reload and check it.')
    }

    const emailed = await sendRejection({
      payload,
      business,
      reason,
      shareReason,
      locale: args.locale,
      listingId: id,
    })
    return { ok: true, emailed }
  } catch (error) {
    await reportError(error, { source: 'place-rejection', extra: { listingId: id } })
    return fail(500, 'The rejection could not be saved. Try again, or check Errors in the admin.')
  }
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
