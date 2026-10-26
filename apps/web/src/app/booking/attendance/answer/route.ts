import { getPayload } from 'payload'
import { GUEST_ANSWERS, type GuestAnswer } from '@vardenia/core'
import { isLocale, type Locale } from '@vardenia/i18n'
import config from '../../../../payload.config'
import { bookingIdFromToken, recordGuestAnswer, visitPageUrl } from '../../../../lib/attendance'
import { RATE_LIMIT, withRateLimit } from '../../../../lib/rate-limit'
import { siteOrigin } from '../../../../lib/auth-email'
import { reportError } from '../../../../lib/report'

/**
 * Where the guest's "Yes, I went" or "No" lands, from the visit page or the
 * passport. A plain form post, so it works without JavaScript.
 *
 *   POST /booking/attendance/answer   token, answer, locale
 *
 * The token is the permission: it is signed for one booking (lib/attendance),
 * so it needs no sign-in and cannot be used for anybody else's visit. The answer
 * is recorded once; see recordGuestAnswer. Then back to the visit page, which
 * says what happened.
 */

export const dynamic = 'force-dynamic'

export const POST = withRateLimit(async (request: Request) => {
  const form = await request.formData().catch(() => null)
  const token = String(form?.get('token') ?? '')
  const answer = String(form?.get('answer') ?? '')
  const rawLocale = String(form?.get('locale') ?? 'en')
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'en'

  const bookingId = bookingIdFromToken(token)
  if (bookingId === null || !(GUEST_ANSWERS as readonly string[]).includes(answer)) {
    return new Response('Not found.', { status: 404 })
  }

  let outcome = 'error'
  try {
    const payload = await getPayload({ config })
    outcome = await recordGuestAnswer(payload, bookingId, answer as GuestAnswer)
  } catch (error) {
    await reportError(error, { source: 'attendance.answer', extra: { booking: bookingId } })
  }

  // From the passport, straight back to it: the stamp shows the result.
  if (form?.get('from') === 'passport') {
    const prefix = locale === 'en' ? '' : `/${locale}`
    return Response.redirect(`${siteOrigin()}${prefix}/account/passport`, 303)
  }

  const back = new URL(visitPageUrl(token, locale))
  back.searchParams.set('done', outcome)
  return Response.redirect(back.toString(), 303)
}, RATE_LIMIT.WRITE_PER_WINDOW)
