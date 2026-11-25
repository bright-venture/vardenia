import { getPayload } from 'payload'
import config from '../../payload.config'
import { readUpload } from '../../lib/place-upload-request'
import { attachPlacePhoto } from '../../lib/place-upload'
import { hashSessionToken } from '../../lib/place-submission'
import { checkRatePerKey, rateHeaders, tooManyRequests, withRateLimit } from '../../lib/rate-limit'

/**
 * The phone sends the logo or the main photo of a Magazine Places form here
 * (step 2). multipart: `sessionToken`, `slot` ('logo' | 'hero'), file `photo`.
 *
 * The session token is the permission, so there is no Turnstile and no account.
 * It travels in the body, never the query string, and is never logged. Each
 * connection has its own counters (action 'place-upload'), and each session
 * token has its own as well (a leaked link cannot be hammered from many places).
 *
 * The size is capped before the body is read (lib/place-upload-request).
 * A token that is unknown, closed, idle or past its cap, and a form that is no
 * longer unfinished, are one plain 404. See lib/place-upload.
 */

export const dynamic = 'force-dynamic'

/** Uploads a minute per session: two photos, retried a few times. */
export const UPLOADS_PER_SESSION_PER_MINUTE = 12
/** Uploads a minute per connection (a hotel or carrier address shared by many phones). */
export const UPLOADS_PER_CONNECTION_PER_MINUTE = 60

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } })

const STATUS = {
  'not-found': 404,
  'too-large': 413,
  'bad-type': 415,
  'bad-file': 400,
  error: 500,
} as const

const NOT_FOUND = 'We could not find that upload link. Please scan the code again.'
const ERROR = 'We could not save that photo. Please try again.'

export const POST = withRateLimit(
  async (request: Request) => {
    const read = await readUpload(request)
    if (!read.ok) return json({ ok: false, message: read.message }, read.status)

    const verdict = await checkRatePerKey(
      'place-upload',
      hashSessionToken(read.token),
      UPLOADS_PER_SESSION_PER_MINUTE,
    )
    if (!verdict.allowed) return tooManyRequests(verdict)

    const payload = await getPayload({ config })
    const outcome = await attachPlacePhoto({
      payload,
      token: read.token,
      slot: read.slot,
      file: read.file,
    })

    if (outcome.ok) {
      return json(
        {
          ok: true,
          slot: outcome.slot,
          logoReceived: outcome.logoReceived,
          heroReceived: outcome.heroReceived,
        },
        200,
        rateHeaders(verdict),
      )
    }
    if (outcome.code === 'not-found') return json({ ok: false, message: NOT_FOUND }, 404)
    if (outcome.code === 'error') return json({ ok: false, message: ERROR }, 500)
    return json({ ok: false, code: outcome.code, message: outcome.message }, STATUS[outcome.code])
  },
  undefined,
  { action: 'place-upload', perMinute: UPLOADS_PER_CONNECTION_PER_MINUTE },
)
