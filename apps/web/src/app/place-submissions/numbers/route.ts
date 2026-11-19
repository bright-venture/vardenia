import { getPayload } from 'payload'
import { LISTING_GOVERNORATES } from '@vardenia/core'
import config from '../../../payload.config'
import { listNumbersFor } from '../../../lib/place-submission'
import { withRateLimit } from '../../../lib/rate-limit'
import { reportError } from '../../../lib/report'

/**
 * Which listing numbers a governorate has, and which are taken, for the number
 * picker on the "add your place" form. Numbers only: never who holds one.
 *
 * Rate limited in memory (the default), like /booking/availability: a read with
 * no side effect and no email, where a database round trip per call would cost
 * more than the abuse does. The write route is the one counted in Postgres.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export const GET = withRateLimit(async (request: Request) => {
  const governorate = new URL(request.url).searchParams.get('governorate') ?? ''
  if (!(LISTING_GOVERNORATES as readonly string[]).includes(governorate)) {
    return json({ ok: false, message: 'Choose a governorate.' }, 400)
  }

  try {
    const payload = await getPayload({ config })
    return json({ ok: true, issues: await listNumbersFor(payload, governorate) })
  } catch (error) {
    await reportError(error, { source: 'place-submission.numbers' })
    return json({ ok: false, message: 'We could not load the numbers.' }, 500)
  }
})
