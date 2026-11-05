import { getPayload } from 'payload'
import config from '../../../../payload.config'
import { bookingIdFromToken, visitSummary } from '../../../../lib/attendance'
import { RECEIPT_MAX_BYTES, receiptType } from '../../../../lib/receipts'
import { readReceipt, readerConfigured, sealReading } from '../../../../lib/receipt-reading'
import { RATE_LIMIT, withRateLimit } from '../../../../lib/rate-limit'
import { reportError } from '../../../../lib/report'

/**
 * Reads the total from a receipt photo while the guest is still on the form.
 *
 *   POST /booking/receipt/read   token, file
 *   200 { reading: { total, currency, date, place }, sealed }
 *       { reading: null }              could not be read: the guest types it
 *       { reading: null, off: true }   reading is not set up: say nothing
 *
 * Called by components/ReceiptPicker as soon as a photo is picked, so the
 * total and currency are filled in for the guest to check. Nothing is stored
 * here: the sealed reading rides along with the form, and /booking/receipt
 * keeps it once the guest sends (lib/receipt-reading).
 *
 * The token is the permission, as for the form itself, and the receipt must
 * still be open for that booking. Each reading costs money, so the budget is
 * the tight one, counted across instances.
 */

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export const POST = withRateLimit(
  async (request: Request) => {
    const form = await request.formData().catch(() => null)
    const bookingId = bookingIdFromToken(String(form?.get('token') ?? ''))
    if (bookingId === null) return json({ reading: null }, 404)
    // Off: the page says nothing and the guest types, as before.
    if (!readerConfigured()) return json({ reading: null, off: true })

    const file = form?.get('file')
    const bytes =
      file && typeof file === 'object' && 'arrayBuffer' in file
        ? new Uint8Array(await (file as Blob).arrayBuffer())
        : null
    if (!bytes || bytes.length === 0 || bytes.length > RECEIPT_MAX_BYTES) {
      return json({ reading: null }, 400)
    }
    const kind = receiptType(bytes)
    if (!kind) return json({ reading: null }, 400)

    try {
      const payload = await getPayload({ config })
      const visit = await visitSummary(payload, bookingId, 'en')
      if (!visit?.receiptOpen) return json({ reading: null }, 409)
      const reading = await readReceipt(bytes, kind, visit.place)
      if (!reading) return json({ reading: null })
      return json({ reading, sealed: sealReading(reading, bookingId, bytes) })
    } catch (error) {
      await reportError(error, {
        source: 'receipt.read',
        level: 'warning',
        extra: { booking: bookingId },
      })
      return json({ reading: null })
    }
  },
  RATE_LIMIT.AUTH_PER_WINDOW,
  { shared: true },
)
