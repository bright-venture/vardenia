import { getPayload } from 'payload'
import config from '../../../payload.config'
import { isSchedulerRequest } from '../../../lib/booking-expiry'
import { applyRetention } from '../../../lib/retention'
import { reportError } from '../../../lib/report'

/**
 * Deletes what the privacy policy only keeps for a while. Called hourly by
 * netlify/functions/apply-retention.mts; see lib/retention.
 *
 * Under /booking with the other scheduler calls, so whatever lets those through
 * Cloudflare lets this one through too. Anything without the scheduler's
 * secret gets a 404, so the endpoint does not even confirm it exists.
 *
 * `?dry=1` counts what a run would do and changes nothing.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export async function POST(request: Request) {
  if (!isSchedulerRequest(request.headers.get('authorization'))) {
    return new Response('Not found.', { status: 404 })
  }

  const dryRun = new URL(request.url).searchParams.get('dry') === '1'

  try {
    const payload = await getPayload({ config })
    const result = await applyRetention(payload, { dryRun })
    if (result.failed > 0) {
      await reportError(new Error(`${result.failed} old booking(s) could not be cleared`), {
        source: 'booking.retention',
        level: 'warning',
        extra: { ...result },
      })
    }
    return json({ ok: true, ...result })
  } catch (error) {
    await reportError(error, { source: 'booking.retention', path: '/booking/retention' })
    return json({ ok: false }, 500)
  }
}
