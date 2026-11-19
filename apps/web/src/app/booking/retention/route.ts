import { getPayload } from 'payload'
import config from '../../../payload.config'
import { isSchedulerRequest } from '../../../lib/booking-expiry'
import { applyRetention } from '../../../lib/retention'
import { hideLapsedListings } from '../../../lib/contract-lapse'
import { expireEndedPlaces } from '../../../lib/place-requests'
import { reportError } from '../../../lib/report'

/**
 * Deletes what the privacy policy only keeps for a while. Called daily by
 * netlify/functions/apply-retention.mts; see lib/retention.
 *
 * Under /booking with the other scheduler calls, so whatever lets those through
 * Cloudflare lets this one through too. Anything without the scheduler's
 * secret gets a 404, so the endpoint does not even confirm it exists.
 *
 * Since 17 November 2026 it also hides listings whose contract has ended (see
 * lib/contract-lapse). Run here rather than from a fourth scheduled function,
 * because both are once a day and every scheduled run costs Netlify credits.
 * Each step runs even if the other fails.
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

  let lapsed: Awaited<ReturnType<typeof hideLapsedListings>> | null = null
  try {
    const payload = await getPayload({ config })
    lapsed = await hideLapsedListings(payload, { dryRun })
    if (lapsed.failed > 0) {
      await reportError(new Error(`${lapsed.failed} lapsed listing(s) could not be hidden`), {
        source: 'contract.lapse',
        level: 'warning',
        extra: { ...lapsed },
      })
    }
  } catch (error) {
    await reportError(error, { source: 'contract.lapse', path: '/booking/retention' })
  }

  // Magazine places whose contract ended become Expired (19 November 2026).
  let placesExpired: Awaited<ReturnType<typeof expireEndedPlaces>> | null = null
  try {
    const payload = await getPayload({ config })
    placesExpired = await expireEndedPlaces(payload, { dryRun })
  } catch (error) {
    await reportError(error, { source: 'place-requests.expire', path: '/booking/retention' })
  }

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
    return json({ ok: true, ...result, lapsed, placesExpired })
  } catch (error) {
    await reportError(error, { source: 'booking.retention', path: '/booking/retention' })
    return json({ ok: false, lapsed }, 500)
  }
}
