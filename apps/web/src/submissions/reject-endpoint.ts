import type { Endpoint } from 'payload'
import { rejectSubmission } from '../lib/place-rejection'

/**
 * `POST /api/reject-submission` - the Reject submission button on a listing.
 *
 * Body: { businessId, reason, shareReason?, locale? }. Staff and admin only:
 * Payload does not apply collection access to a custom endpoint, so the role
 * is checked inside lib/place-rejection against the signed-in staff account
 * (a partner or a guest account, or no session, is refused with 403 before
 * anything is read). Same pattern as the CSV import endpoint.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

export const rejectSubmissionEndpoint: Endpoint = {
  path: '/reject-submission',
  method: 'post',
  handler: async (req) => {
    let body: Record<string, unknown>
    try {
      body = ((await req.json?.()) ?? {}) as Record<string, unknown>
    } catch {
      body = {}
    }
    const outcome = await rejectSubmission({
      payload: req.payload,
      user: req.user,
      businessId: body.businessId,
      reason: body.reason,
      shareReason: body.shareReason,
      locale: body.locale,
    })
    return outcome.ok
      ? json({ ok: true, emailed: outcome.emailed })
      : json({ error: outcome.message }, outcome.status)
  },
}
