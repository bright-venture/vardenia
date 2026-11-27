import { getPayload } from 'payload'
import { LOCALE_CODES } from '@vardenia/core'
import config from '../../../payload.config'
import { loadMagazine } from '../../../lib/magazine-view'
import { withRateLimit } from '../../../lib/rate-limit'
import { reportError } from '../../../lib/report'
import { issueParam } from '../issues/params'

/**
 * The magazine viewer's data (27 November 2026): one issue's pages (computed
 * from its slots), its governorate blocks and the businesses that hold a
 * number, as the printed page shows them.
 *
 * The issue's slots and template are staff-only, so this route reads them with
 * the server's access and returns only the fields of lib/magazine-view: never
 * owner e-mail, owner or verified phone, status or payment data. Uncached (the
 * viewer polls it) and rate limited in memory, like the issues route.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export const GET = withRateLimit(async (request: Request) => {
  const params = new URL(request.url).searchParams
  const issue = issueParam(params.get('issue'))
  if (issue === null) return json({ ok: false, message: 'Choose an issue.' }, 400)
  const rawLocale = params.get('locale')
  const locale =
    rawLocale && (LOCALE_CODES as readonly string[]).includes(rawLocale) ? rawLocale : undefined

  try {
    const payload = await getPayload({ config })
    const data = await loadMagazine(payload, issue, locale)
    if ('problem' in data) {
      return data.problem === 'not-found'
        ? json({ ok: false, problem: 'not-found', message: 'That issue was not found.' }, 404)
        : json({ ok: false, problem: 'no-slots', message: 'That issue has no pages to show.' }, 409)
    }
    return json({ ok: true, ...data })
  } catch (error) {
    await reportError(error, { source: 'place-submission.magazine' })
    return json({ ok: false, message: 'We could not load the magazine.' }, 500)
  }
})
