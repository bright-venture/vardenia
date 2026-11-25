import { getPayload } from 'payload'
import config from '../../../payload.config'
import { downpaymentFor } from '../../../lib/place-payment-rules'
import { getPlaceSettings } from '../../../lib/place-settings'
import { withRateLimit } from '../../../lib/rate-limit'

/**
 * The price and the terms shown on step 3 of the "add your place" form: the
 * Settings values (Magazine places tab). Two-stage payment (spec v4): the
 * downpayment (percent and amount, rounded to the cent exactly as the finish
 * service and the payment engine copy it) and the days to pay it and, once
 * accepted, the rest. Public, no secrets (the company Whish number is NOT
 * returned: the owner gets it by email), never cached.
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
      downpaymentPercent: settings.downpaymentPercent,
      downpaymentAmount: downpaymentFor(settings.pricePerYear, settings.downpaymentPercent),
      downpaymentDeadlineDays: settings.downpaymentDeadlineDays,
      balanceDeadlineDays: settings.balanceDeadlineDays,
    })
  } catch {
    return json({ ok: false, message: 'We could not load the price.' }, 500)
  }
})
