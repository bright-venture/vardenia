import { getPayload } from 'payload'
import config from '../../../payload.config'
import { isSchedulerRequest } from '../../../lib/booking-expiry'
import { askGuestsAboutVisits } from '../../../lib/attendance'
import { reportError } from '../../../lib/report'

/**
 * Sends "Did you go?" for visits that ended a couple of hours ago. Called every
 * hour by netlify/functions/ask-attendance.mts; see lib/attendance.
 *
 * Not a page and not for people: anything without the scheduler's secret gets
 * a 404, as /booking/expire does.
 */

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isSchedulerRequest(request.headers.get('authorization'))) {
    return new Response('Not found.', { status: 404 })
  }

  try {
    const payload = await getPayload({ config })
    const result = await askGuestsAboutVisits(payload)
    return Response.json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    await reportError(error, { source: 'attendance.ask', path: '/booking/attendance' })
    return Response.json({ ok: false }, { status: 500 })
  }
}
