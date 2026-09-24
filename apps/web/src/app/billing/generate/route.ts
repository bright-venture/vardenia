import { getPayload } from 'payload'
import config from '../../../payload.config'
import { isStaffRequest, sameOrigin } from '../../../lib/billing-auth'
import { NotReadyError, drawUpStatements } from '../../../lib/statements'
import { reportError } from '../../../lib/report'

/**
 * Draws up the drafts for one month. Staff only, from Booking fees in the admin.
 *
 * Answers with a redirect back to the page carrying a one-line summary, so a
 * reload of the result does not post the form again.
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
    const result = await drawUpStatements(payload, period)
    message = [
      `${result.created} draft${result.created === 1 ? '' : 's'} created.`,
      result.markedCompleted > 0
        ? `${result.markedCompleted} unmarked booking${result.markedCompleted === 1 ? '' : 's'} counted as completed.`
        : '',
      result.alreadyDrawnUp > 0 ? `${result.alreadyDrawnUp} venue(s) already had a statement.` : '',
      result.nothingOwed > 0 ? `${result.nothingOwed} venue(s) owed nothing.` : '',
      result.incomplete.length > 0
        ? `Not drawn up, bookings could not all be read: ${result.incomplete.join(', ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ')
  } catch (error) {
    if (error instanceof NotReadyError) {
      message = error.message
    } else {
      await reportError(error, { source: 'billing.generate', extra: { period } })
      message = 'Drawing up failed. The error has been reported.'
    }
  }

  const back = new URL('/admin/billing', request.url)
  back.searchParams.set('period', period)
  back.searchParams.set('message', message)
  return Response.redirect(back, 303)
}
