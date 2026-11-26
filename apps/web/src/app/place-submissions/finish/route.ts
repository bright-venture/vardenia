import { getPayload } from 'payload'
import config from '../../../payload.config'
import { finishPlaceSubmission } from '../../../lib/place-submission-finish'
import { readBody } from '../../../lib/place-submission-request'
import { withRateLimit } from '../../../lib/rate-limit'
import { clientIp } from '../../../lib/scan-guard'
import { verifyTurnstile } from '../../../lib/turnstile'

/**
 * Step 3 of the "add your place" form: the owner accepts the terms and sends
 * the submission. JSON `{ sessionToken, acceptedTerms, turnstileToken, locale? }`.
 * `locale` only picks the language of the owner's confirmation email.
 *
 * Same door as the start route: rate limited per address (its own counters),
 * Turnstile, no-store.
 * A bad or expired token is one plain 404 whatever the reason; a repeat of a
 * finish that already worked answers 200 with the same reference.
 * See lib/place-submission-finish.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

const STATUS = {
  'not-found': 404,
  'terms-not-accepted': 422,
  'photos-missing': 422,
  error: 500,
} as const

const MESSAGE = {
  'not-found': 'We could not find that submission. Please start again.',
  'terms-not-accepted': 'Please accept the terms to send your business.',
  'photos-missing': 'Please add your logo and main photo first.',
  error: 'We could not save that. Please try again.',
} as const

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

    const { sessionToken, acceptedTerms, locale } = read.body
    if (typeof sessionToken !== 'string' || typeof acceptedTerms !== 'boolean') {
      return json({ ok: false, message: 'The submission is incomplete.' }, 400)
    }

    const payload = await getPayload({ config })
    const outcome = await finishPlaceSubmission({
      payload,
      token: sessionToken,
      acceptedTerms,
      locale: locale === 'ar' ? 'ar' : 'en',
    })

    if (!outcome.ok) {
      return json(
        { ok: false, code: outcome.code, message: MESSAGE[outcome.code] },
        STATUS[outcome.code],
      )
    }
    return json({ ok: true, reference: outcome.reference }, 200)
  },
  // Its own counters (action 'place-finish', see place-start's route).
  undefined,
  { action: 'place-finish' },
)
