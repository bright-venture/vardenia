import { getPayload } from 'payload'
import { isLocale, type Locale } from '@vardenia/i18n'
import config from '../../../payload.config'
import { bookingIdFromToken, visitPageUrl } from '../../../lib/attendance'
import { readCurrency, readReceiptAmount, saveReceipt } from '../../../lib/receipts'
import { RATE_LIMIT, withRateLimit } from '../../../lib/rate-limit'
import { reportError } from '../../../lib/report'

/**
 * Where a guest's receipt lands, from the "Did you go?" page.
 *
 *   POST /booking/receipt   token, file, amount, currency, locale
 *
 * A plain multipart form post, so it works without JavaScript; with it, the
 * page shrinks a large photo first (components/ReceiptPicker). The token is the
 * permission, signed for one booking (lib/attendance). Back to the visit page,
 * which says what happened with `?receipt=`.
 */

export const dynamic = 'force-dynamic'

export const POST = withRateLimit(async (request: Request) => {
  const form = await request.formData().catch(() => null)
  const token = String(form?.get('token') ?? '')
  const rawLocale = String(form?.get('locale') ?? 'en')
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'en'

  const bookingId = bookingIdFromToken(token)
  if (bookingId === null) return new Response('Not found.', { status: 404 })

  const file = form?.get('file')
  const currency = readCurrency(form?.get('currency'))
  let outcome = 'error'
  try {
    const bytes =
      file && typeof file === 'object' && 'arrayBuffer' in file
        ? new Uint8Array(await (file as Blob).arrayBuffer())
        : null
    const payload = await getPayload({ config })
    outcome = await saveReceipt(payload, bookingId, {
      bytes,
      amount: readReceiptAmount(form?.get('amount'), currency),
      currency,
    })
  } catch (error) {
    await reportError(error, { source: 'receipt.upload', extra: { booking: bookingId } })
  }

  const back = new URL(visitPageUrl(token, locale))
  back.searchParams.set('receipt', outcome)
  return Response.redirect(back.toString(), 303)
}, RATE_LIMIT.WRITE_PER_WINDOW)
