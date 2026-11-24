import { getPayload } from 'payload'
import config from '../../../payload.config'
import { isSchedulerRequest } from '../../../lib/booking-expiry'
import { abandonIncomplete } from '../../../lib/place-abandon'
import { reportError } from '../../../lib/report'

/**
 * Gives up unfinished "add your place" forms (an incomplete business whose
 * phone upload session expired or went quiet) and frees their numbers. Called
 * every 5 minutes by netlify/functions/abandon-incomplete.mts; see
 * lib/place-abandon.
 *
 * Under /booking with the other scheduler calls, so whatever lets those through
 * Cloudflare lets this one through too. Anything without the scheduler's
 * secret gets a 404, so the endpoint does not even confirm it exists.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export async function POST(request: Request) {
  if (!isSchedulerRequest(request.headers.get('authorization'))) {
    return new Response('Not found.', { status: 404 })
  }

  try {
    const payload = await getPayload({ config })
    const result = await abandonIncomplete({ payload })
    if (result.failed > 0 || result.mediaFailed > 0) {
      await reportError(
        new Error(
          `${result.failed} unfinished form(s) and ${result.mediaFailed} photo(s) could not be cleared`,
        ),
        {
          source: 'place.abandon',
          level: 'warning',
          extra: { ...result },
        },
      )
    }
    return json({ ok: true, ...result })
  } catch (error) {
    await reportError(error, { source: 'place.abandon', path: '/booking/abandon-incomplete' })
    return json({ ok: false }, 500)
  }
}
