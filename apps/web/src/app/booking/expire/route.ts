import { getPayload } from 'payload'
import config from '../../../payload.config'
import { expireUnansweredBookings, isSchedulerRequest } from '../../../lib/booking-expiry'
import { reportError } from '../../../lib/report'

/**
 * Declines the requests nobody answered before their time. Called every 15
 * minutes by netlify/functions/expire-bookings.mts; see lib/booking-expiry.
 *
 * Not a page and not for people: anything without the scheduler's secret gets
 * a 404, so the endpoint does not even confirm it exists.
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
    const result = await expireUnansweredBookings(payload)
    if (result.failed > 0) {
      await reportError(new Error(`${result.failed} unanswered booking(s) could not be declined`), {
        source: 'booking.expire',
        level: 'warning',
        extra: { ...result },
      })
    }
    return json({ ok: true, ...result })
  } catch (error) {
    await reportError(error, { source: 'booking.expire', path: '/booking/expire' })
    return json({ ok: false }, 500)
  }
}
