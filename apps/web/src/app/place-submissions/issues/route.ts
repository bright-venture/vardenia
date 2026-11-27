import { getPayload } from 'payload'
import { LOCALE_CODES } from '@vardenia/core'
import config from '../../../payload.config'
import { issuePlaces, openIssues } from '../../../lib/place-submission'
import { withRateLimit } from '../../../lib/rate-limit'
import { reportError } from '../../../lib/report'
import { issueParam } from './params'

/**
 * The first choices of the "add your place" form, which is issue first (27
 * November 2026).
 *
 * - No `issue`: the issues open to listings (every issue with at least one
 *   block of numbers), newest first, each with its coverage and, for an issue
 *   that covers one governorate, that governorate. The title is in `locale`
 *   when one of the site's languages is given.
 * - `issue=<id>`: the places of that issue, each with its free slot count: the
 *   governorates with a block (All Lebanon) or the cities with a block (one
 *   governorate). A full place has `free: 0`.
 *
 * Small answers only: never an issue's slots, prices or template, and never
 * who holds a number. Rate limited in memory, like the numbers route.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export const GET = withRateLimit(async (request: Request) => {
  const params = new URL(request.url).searchParams
  const rawIssue = params.get('issue')
  const issue = rawIssue === null ? null : issueParam(rawIssue)
  if (rawIssue !== null && issue === null) {
    return json({ ok: false, message: 'Choose an issue.' }, 400)
  }
  const rawLocale = params.get('locale')
  const locale =
    rawLocale && (LOCALE_CODES as readonly string[]).includes(rawLocale) ? rawLocale : undefined

  try {
    const payload = await getPayload({ config })
    if (issue !== null) return json({ ok: true, places: await issuePlaces(payload, issue) })
    return json({ ok: true, issues: await openIssues(payload, locale) })
  } catch (error) {
    await reportError(error, { source: 'place-submission.issues' })
    return json({ ok: false, message: 'We could not load the issues.' }, 500)
  }
})
