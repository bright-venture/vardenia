import { getPayload } from 'payload'
import config from '../../../payload.config'
import { isSchedulerRequest } from '../../../lib/booking-expiry'
import { runPaymentJobs } from '../../../lib/place-payment-jobs'
import { reportError } from '../../../lib/report'

/**
 * The timed side of the Magazine Places payment (spec v4): lapses unpaid
 * downpayments, sends the two reminders, rejects unpaid balances. Called every
 * 15 minutes by netlify/functions/place-payment-jobs.mts; see
 * lib/place-payment-jobs.
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
    const result = await runPaymentJobs({ payload })
    if (result.failed > 0) {
      await reportError(new Error(`${result.failed} payment job(s) could not be done`), {
        source: 'place.payment-jobs',
        level: 'warning',
        extra: { ...result },
      })
    }
    return json({ ok: true, ...result })
  } catch (error) {
    await reportError(error, { source: 'place.payment-jobs', path: '/booking/place-payment-jobs' })
    return json({ ok: false }, 500)
  }
}
