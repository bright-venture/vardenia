import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  PayloadRequest,
} from 'payload'
import { receiptInDollars } from '@vardenia/core'

/**
 * Keeps a booking's `receiptAmount` equal to its receipt's total, in dollars.
 *
 * Billing takes the receipt first (core/billableAmount) and the dispute flag
 * compares the venue's figure with it (core/attendanceMismatch). Both read the
 * booking, so the total is copied onto it rather than looked up every time:
 *
 * - on the booking, whenever its receipt is set or changed (the upload route
 *   links it; staff can too), and whenever a receipt asks it to refresh;
 * - from the receipt, when staff correct its total or currency, or delete it.
 *
 * Pounds are converted at the rate on the Settings page as it stands at that
 * moment, which for a guest's upload is the day they paid.
 */

/** Asks the booking hook below to read the receipt again. */
export const REFRESH_RECEIPT_AMOUNT = 'refreshReceiptAmount'

const idOf = (value: unknown): number | string | null => {
  const id = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

/** The receipt's total in dollars, or null when it gives none. Never throws. */
export async function receiptDollars(
  req: PayloadRequest,
  receiptId: number | string,
): Promise<number | null> {
  const receipt = (await req.payload
    .findByID({ collection: 'receipts', id: receiptId, depth: 0, overrideAccess: true, req })
    .catch(() => null)) as { amount?: number | null; currency?: string | null } | null
  if (!receipt) return null
  const settings = (await req.payload
    .findGlobal({ slug: 'settings', depth: 0, overrideAccess: true, req })
    .catch(() => null)) as { poundsPerDollar?: number | null } | null
  return receiptInDollars(receipt.amount, receipt.currency, settings?.poundsPerDollar)
}

export const stampReceiptAmount: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
  context,
}) => {
  if (!data) return data
  const before = idOf((originalDoc as { receipt?: unknown } | undefined)?.receipt)
  const after = 'receipt' in data ? idOf(data.receipt) : before
  if (after === before && !context?.[REFRESH_RECEIPT_AMOUNT]) return data
  data.receiptAmount = after === null ? null : await receiptDollars(req, after)
  return data
}

/** The booking a receipt belongs to, asked to read it again. */
async function refreshBooking(req: PayloadRequest, bookingId: unknown): Promise<void> {
  const id = idOf(bookingId)
  if (id === null) return
  await req.payload.update({
    collection: 'bookings',
    id,
    data: {},
    depth: 0,
    overrideAccess: true,
    req,
    context: { [REFRESH_RECEIPT_AMOUNT]: true },
  })
}

/** Staff corrected a receipt's total or currency: the booking follows. */
export const refreshBookingFromReceipt: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (operation !== 'update') return doc
  const was = previousDoc as { amount?: unknown; currency?: unknown } | undefined
  const now = doc as { amount?: unknown; currency?: unknown; booking?: unknown }
  if (was && was.amount === now.amount && was.currency === now.currency) return doc
  await refreshBooking(req, now.booking)
  return doc
}

/** A receipt removed: the booking stops billing on it. */
export const refreshBookingAfterReceiptDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await refreshBooking(req, (doc as { booking?: unknown }).booking)
  return doc
}
