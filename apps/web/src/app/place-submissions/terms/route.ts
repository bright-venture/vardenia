import { getPayload } from 'payload'
import config from '../../../payload.config'
import { downpaymentFor } from '../../../lib/place-payment-rules'
import { draftPrice } from '../../../lib/place-draft-price'
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
 *
 * # The price is the started form's own (PRD v7 section 5)
 *
 * With the form's session token in the `x-place-session` header, the price and
 * downpayment are the ones copied onto its draft when it started (lib/place-
 * draft-price), so an admin editing the issue's price afterwards changes
 * nothing for that form. The token travels in a header, never in the address,
 * so it stays out of logs. Without one (or for a form started before layouts),
 * the Settings values answer as before.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export const GET = withRateLimit(async (request?: Request) => {
  try {
    const payload = await getPayload({ config })
    const settings = await getPlaceSettings(payload)
    const draft = await draftPrice(payload, request?.headers.get('x-place-session'))
    const price = draft?.price ?? settings.pricePerYear
    return json({
      ok: true,
      layoutsEnabled: true,
      price,
      currency: settings.currency,
      termMonths: settings.termMonths,
      termsVersion: settings.termsVersion,
      downpaymentPercent: settings.downpaymentPercent,
      downpaymentAmount:
        draft?.downpaymentAmount ?? downpaymentFor(price, settings.downpaymentPercent),
      downpaymentDeadlineDays: settings.downpaymentDeadlineDays,
      balanceDeadlineDays: settings.balanceDeadlineDays,
    })
  } catch {
    return json({ ok: false, message: 'We could not load the price.' }, 500)
  }
})
