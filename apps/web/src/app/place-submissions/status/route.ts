import { getPayload } from 'payload'
import config from '../../../payload.config'
import { placeSessionStatus } from '../../../lib/place-upload'
import { readBody } from '../../../lib/place-submission-request'
import { hashSessionToken } from '../../../lib/place-submission'
import { checkRatePerKey, tooManyRequests, withRateLimit } from '../../../lib/rate-limit'

/**
 * What the big screen polls (every 2 seconds) while the owner sends the photos
 * from their phone: JSON `{ sessionToken }` answers
 * `{ ok: true, logoReceived, heroReceived, live }` or a plain 404.
 *
 * Token in the body, never the query string; no-store; no private data. It only
 * reads: polling does not keep the session alive (only the phone's uploads do).
 * Its own counters (action 'place-status'), sized for one poll every 2 seconds
 * (30 a minute) with room for a second tab and a retry, per session token and
 * per connection. See lib/place-upload.
 */

export const dynamic = 'force-dynamic'

/** 1 poll / 2 s is 30 a minute; room for a second tab and retries. */
export const STATUS_PER_SESSION_PER_MINUTE = 60
/** Per connection: a few screens or tabs behind one address. */
export const STATUS_PER_CONNECTION_PER_MINUTE = 120

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export const POST = withRateLimit(
  async (request: Request) => {
    const read = await readBody(request)
    if (!read.ok) return json(read.body, read.status)

    const { sessionToken } = read.body
    if (typeof sessionToken !== 'string' || !sessionToken || sessionToken.length > 200) {
      return json({ ok: false, message: 'The request is incomplete.' }, 400)
    }

    const verdict = await checkRatePerKey(
      'place-status',
      hashSessionToken(sessionToken),
      STATUS_PER_SESSION_PER_MINUTE,
    )
    if (!verdict.allowed) return tooManyRequests(verdict)

    const payload = await getPayload({ config })
    const outcome = await placeSessionStatus({ payload, token: sessionToken })
    if (!outcome.ok) {
      return json({ ok: false, message: 'We could not find that submission.' }, 404)
    }
    return json({
      ok: true,
      logoReceived: outcome.logoReceived,
      heroReceived: outcome.heroReceived,
      live: outcome.live,
    })
  },
  undefined,
  { action: 'place-status', perMinute: STATUS_PER_CONNECTION_PER_MINUTE },
)
