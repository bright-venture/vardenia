import { getPayload } from 'payload'
import config from '../../../payload.config'
import { LOCALES, type Locale } from '@vardenia/i18n'
import { RATE_LIMIT, withRateLimit } from '../../../lib/rate-limit'
import { clientIp } from '../../../lib/scan-guard'
import { verifyTurnstile } from '../../../lib/turnstile'
import { reportError } from '../../../lib/report'

/**
 * A guest's question from the bottom of the Questions page (18 November 2026).
 *
 * No account needed, so three guards: the same Turnstile check as sign-up
 * (inactive until its key is set), a hidden field a person never fills, and
 * the write rate limit. Nothing is emailed to the address given, so the form
 * cannot be used to send mail to a stranger; the team answers from the admin.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

export const POST = withRateLimit(
  async (request: Request) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return json({ ok: false }, 400)

    // The hidden field. A person never sees it; a bot fills every field.
    if (text(body.website, 200)) return json({ ok: true }, 201)

    const verdict = await verifyTurnstile(body.turnstileToken, clientIp(request.headers))
    if (!verdict.ok) return json({ ok: false, code: 'turnstile' }, 403)

    const name = text(body.name, 120)
    const email = text(body.email, 254).toLowerCase()
    const question = text(body.question, 2000)
    const lang = text(body.locale, 5)
    const locale: Locale = (LOCALES as readonly string[]).includes(lang) ? (lang as Locale) : 'en'

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (name.length < 2 || !emailOk || question.length < 5) {
      return json({ ok: false, code: 'invalid' }, 400)
    }

    try {
      const payload = await getPayload({ config })
      await payload.create({
        collection: 'guest-questions',
        overrideAccess: true,
        data: { name, email, question, locale, status: 'new' },
      })
    } catch (error) {
      await reportError(error, { source: 'guest-question', path: '/booking/question' })
      return json({ ok: false }, 500)
    }
    return json({ ok: true }, 201)
  },
  RATE_LIMIT.WRITE_PER_WINDOW,
  // Counted in the database, so the limit holds across every server, like the
  // other public forms (21 November 2026, authentication audit). No account is
  // involved, so 20 a minute per connection, on a counter of its own since
  // 22 November 2026: spam here cannot use up bookings (lib/rate-limit).
  { action: 'question' },
)
