import { getPayload } from 'payload'
import { GOVERNORATES, LISTING_GOVERNORATES } from '@vardenia/core'
import config from '../../../payload.config'
import { listNumbersFor } from '../../../lib/place-submission'
import { withRateLimit } from '../../../lib/rate-limit'
import { reportError } from '../../../lib/report'
import { issueParam } from '../issues/params'

/**
 * Which listing numbers one place of one issue has, and which are taken, for
 * the number picker on the "add your place" form. Numbers only: never who
 * holds one.
 *
 * Issue first (27 November 2026): `issue` (required) and then the place:
 * `governorate` for an All Lebanon issue, `city` for an issue that covers one
 * governorate (whose governorate comes from the issue, never from here). The
 * issue decides which of the two counts (lib/place-submission listNumbersFor);
 * the other is ignored. The answer lists at most one issue: none when the
 * place has no block in it.
 *
 * Rate limited in memory (the default), like /booking/availability: a read with
 * no side effect and no email, where a database round trip per call would cost
 * more than the abuse does. The write route is the one counted in Postgres.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

const isCity = (city: string) => GOVERNORATES.some((g) => g.cities.some((c) => c.slug === city))

export const GET = withRateLimit(async (request: Request) => {
  const params = new URL(request.url).searchParams
  const issue = issueParam(params.get('issue'))
  if (issue === null) return json({ ok: false, message: 'Choose an issue.' }, 400)
  const governorate = params.get('governorate') || undefined
  if (
    governorate !== undefined &&
    !(LISTING_GOVERNORATES as readonly string[]).includes(governorate)
  ) {
    return json({ ok: false, message: 'Choose a governorate.' }, 400)
  }
  const city = params.get('city') || undefined
  if (city !== undefined && !isCity(city)) {
    return json({ ok: false, message: 'Choose a city.' }, 400)
  }
  if (governorate === undefined && city === undefined) {
    return json({ ok: false, message: 'Choose a governorate or a city.' }, 400)
  }

  try {
    const payload = await getPayload({ config })
    return json({ ok: true, issues: await listNumbersFor(payload, issue, { governorate, city }) })
  } catch (error) {
    await reportError(error, { source: 'place-submission.numbers' })
    return json({ ok: false, message: 'We could not load the numbers.' }, 500)
  }
})
