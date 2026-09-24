import { getPayload } from 'payload'
import config from '../../../payload.config'
import { isStaffRequest, sameOrigin } from '../../../lib/billing-auth'
import { sendDrafts } from '../../../lib/statements'
import { reportError } from '../../../lib/report'

/**
 * Sends every draft of one month. Staff only, from Booking fees in the admin.
 *
 * Sending is what starts a venue's clock: the seven days to question a line and
 * the fifteen to pay are stamped by the collection the moment each statement
 * becomes `sent`, and the email goes from the same place.
 */

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Cross-site request refused.', { status: 403 })

  const payload = await getPayload({ config })
  if (!(await isStaffRequest(payload, request.headers))) {
    return new Response('Staff only. Sign in to the admin panel first.', { status: 403 })
  }

  const form = await request.formData()
  const period = String(form.get('period') ?? '')

  let message: string
  try {
    const sent = await sendDrafts(payload, period)
    message = `${sent} statement${sent === 1 ? '' : 's'} sent.`
  } catch (error) {
    await reportError(error, { source: 'billing.send', extra: { period } })
    message = 'Sending failed part way. The error has been reported; check the list below.'
  }

  const back = new URL('/admin/billing', request.url)
  back.searchParams.set('period', period)
  back.searchParams.set('message', message)
  return Response.redirect(back, 303)
}
