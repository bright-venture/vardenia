import { getPayload } from 'payload'
import config from '../../../payload.config'
import { getPlaceSettings } from '../../../lib/place-settings'
import { withRateLimit } from '../../../lib/rate-limit'

/**
 * The price and the term shown on step 3 of the "add your place" form: the
 * Settings values (Magazine places tab), nothing else. Public, no secrets (the
 * company number and the payment deadline are NOT returned), never cached.
 *
 * Rate limited in memory like the number picker: a read with no side effect.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export const GET = withRateLimit(async () => {
  try {
    const payload = await getPayload({ config })
    const settings = await getPlaceSettings(payload)
    return json({
      ok: true,
      price: settings.pricePerYear,
      currency: settings.currency,
      termMonths: settings.termMonths,
      termsVersion: settings.termsVersion,
    })
  } catch {
    return json({ ok: false, message: 'We could not load the price.' }, 500)
  }
})
