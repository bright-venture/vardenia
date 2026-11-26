import type { Endpoint } from 'payload'
import { rejectSubmission } from '../lib/place-rejection'
import { json, readActionBody } from './action-body'

/**
 * `POST /api/reject-submission` - Reject: not accepted, on a listing.
 *
 * Body (strict): { businessId, reason, shareReason?, locale? }. Staff and
 * admin only: Payload does not apply collection access to a custom endpoint,
 * so the role is checked inside lib/place-payments against the signed-in
 * staff account (a partner or a guest account, or no session, is refused
 * with 403 before anything is read). Same pattern as the CSV import endpoint.
 *
 * Answers { ok, emailed, refundDue } or { error, code } with the status.
 */

export const rejectSubmissionEndpoint: Endpoint = {
  path: '/reject-submission',
  method: 'post',
  handler: async (req) => {
    const read = await readActionBody(req, ['businessId', 'reason', 'shareReason', 'locale'])
    if (!read.ok) return read.response
    const { body } = read
    const outcome = await rejectSubmission({
      payload: req.payload,
      user: req.user,
      businessId: body.businessId,
      reason: body.reason,
      shareReason: body.shareReason,
      locale: body.locale,
    })
    return outcome.ok
      ? json({ ok: true, emailed: outcome.emailed, refundDue: outcome.refundDue })
      : json({ error: outcome.message, code: outcome.code }, outcome.status)
  },
}
