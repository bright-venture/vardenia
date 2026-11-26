import { getPayload } from 'payload'
import config from '../../payload.config'
import { siteOrigin } from '../../lib/auth-email'
import { startPlaceSubmission } from '../../lib/place-submission'
import { placeUploadUrl } from '../../lib/place-upload-url'
import { parseSubmission, readBody, statusForOutcome } from '../../lib/place-submission-request'
import { withRateLimit } from '../../lib/rate-limit'
import { clientIp } from '../../lib/scan-guard'
import { verifyTurnstile } from '../../lib/turnstile'

/**
 * The public "add your place" endpoint, step 1 ("Next"): the only way an
 * anonymous visitor creates a listing. `businesses.create` stays staff-only;
 * lib/place-submission is the access rule, and this is the door to it.
 *
 * It starts a submission: a hidden draft with its number held, and the token
 * of the phone upload session. No emails go out here; they go when the owner
 * finishes. The listing id never leaves the server: the browser gets the
 * reference (VD-n) and the session token.
 *
 * Not under /api, which Payload owns (see /booking/request).
 *
 * Order, cheapest refusal first: rate limit, JSON body, Turnstile, schema, then
 * the write.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export const POST = withRateLimit(
  async (request: Request) => {
    const read = await readBody(request)
    if (!read.ok) return json(read.body, read.status)

    const verdict = await verifyTurnstile(read.body.turnstileToken, clientIp(request.headers))
    if (!verdict.ok) {
      return json(
        {
          ok: false,
          code: verdict.reason,
          message: 'We could not confirm you are a person. Please try again.',
        },
        403,
      )
    }

    const parsed = parseSubmission(read.body)
    if (!parsed.ok) return json(parsed.body, parsed.status)

    const payload = await getPayload({ config })
    const outcome = await startPlaceSubmission({ payload, input: parsed.input })

    if (!outcome.ok) {
      return json(
        { ok: false, code: outcome.code, message: outcome.message },
        statusForOutcome(outcome.code),
      )
    }

    return json(
      {
        ok: true,
        reference: outcome.reference,
        sessionToken: outcome.sessionToken,
        expiresAt: outcome.expiresAt,
        // For the QR code on the big screen. The token is in the fragment, so
        // it never reaches a log; do not log or report this response either.
        uploadUrl: placeUploadUrl(siteOrigin(), outcome.sessionToken, parsed.input.locale),
      },
      201,
    )
  },
  // Its own counters (action 'place-start'), counted in the database per
  // connection: the per-action budget is WRITE_PER_WINDOW (lib/rate-limit
  // checkRatePerAccount), separate from the finish form and every other.
  undefined,
  { action: 'place-start' },
)
