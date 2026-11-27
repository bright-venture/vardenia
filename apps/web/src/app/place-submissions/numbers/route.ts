import { getPayload } from 'payload'
import { LISTING_GOVERNORATES, isCityOf } from '@vardenia/core'
import config from '../../../payload.config'
import { listNumbersFor } from '../../../lib/place-submission'
import { withRateLimit } from '../../../lib/rate-limit'
import { reportError } from '../../../lib/report'

/**
 * Which listing numbers a governorate has, and which are taken, for the number
 * picker on the "add your place" form. Numbers only: never who holds one.
 *
 * `city` (optional, one of the governorate's cities): an issue that covers one
 * governorate is listed only with the block of that city (lib/place-submission
 * listNumbersFor).
 *
 * Rate limited in memory (the default), like /booking/availability: a read with
 * no side effect and no email, where a database round trip per call would cost
 * more than the abuse does. The write route is the one counted in Postgres.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export const GET = withRateLimit(async (request: Request) => {
  const params = new URL(request.url).searchParams
  const governorate = params.get('governorate') ?? ''
  if (!(LISTING_GOVERNORATES as readonly string[]).includes(governorate)) {
    return json({ ok: false, message: 'Choose a governorate.' }, 400)
  }
  const city = params.get('city') || undefined
  if (city !== undefined && !isCityOf(governorate, city)) {
    return json({ ok: false, message: 'Choose a city of that governorate.' }, 400)
  }

  try {
    const payload = await getPayload({ config })
    return json({ ok: true, issues: await listNumbersFor(payload, governorate, city) })
  } catch (error) {
    await reportError(error, { source: 'place-submission.numbers' })
    return json({ ok: false, message: 'We could not load the numbers.' }, 500)
  }
})
