import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { dataLocale, type Locale } from '@vardenia/i18n'
import config from '../payload.config'
import { CUSTOMER_COLLECTION } from '../access/index'

/**
 * The receipts the signed-in guest has sent, for "My receipts" on the account.
 *
 * Read with the guest's own session and `overrideAccess: false`, so the
 * Receipts collection's read rule (the guest's own receipts only) is applied in
 * the database: nothing here decides whose receipt is whose. The file itself is
 * opened through Payload's file route, which applies the same rule again, so a
 * link copied to somebody else opens nothing for them.
 */

export interface MyReceipt {
  id: number
  /** The place, as the guest's language names it. Empty for a deleted listing. */
  place: string
  /** Empty for a listing that is no longer published, which renders unlinked. */
  slug: string
  visit: Date | null
  sentAt: Date
  amount: number | null
  currency: string
  /** Payload's own file route, behind the access check. */
  fileUrl: string | null
  isPdf: boolean
}

type Populated<T> = T | number | null | undefined

interface ReceiptDoc {
  id: number
  createdAt: string
  amount?: number | null
  currency?: string | null
  url?: string | null
  mimeType?: string | null
  booking?: Populated<{
    start?: string | null
    business?: Populated<{ name?: string | null; slug?: string | null; _status?: string | null }>
  }>
}

const object = <T>(value: Populated<T>): T | null =>
  typeof value === 'object' && value !== null ? value : null

/** One receipt as the page shows it. Pure, so it is tested without a database. */
export function toMyReceipt(doc: ReceiptDoc): MyReceipt {
  const booking = object(doc.booking)
  const business = object(booking?.business)
  return {
    id: doc.id,
    place: business?.name ?? '',
    slug: business && business._status !== 'draft' ? (business.slug ?? '') : '',
    visit: booking?.start ? new Date(booking.start) : null,
    sentAt: new Date(doc.createdAt),
    amount: typeof doc.amount === 'number' ? doc.amount : null,
    currency: doc.currency ?? 'USD',
    fileUrl: doc.url ?? null,
    isPdf: doc.mimeType === 'application/pdf',
  }
}

/** Newest first. Empty for anybody who is not a signed-in guest. */
export async function receiptsForCurrent(locale: Locale, limit = 100): Promise<MyReceipt[]> {
  const payload = await getPayload({ config })
  const auth = await payload
    .auth({ headers: await nextHeaders() })
    .catch(() => ({ user: null }) as { user: null })
  const user = auth.user
  if (!user || user.collection !== CUSTOMER_COLLECTION) return []

  const rows = await payload.find({
    collection: 'receipts',
    depth: 2,
    limit,
    sort: '-createdAt',
    locale: dataLocale(locale),
    overrideAccess: false,
    user,
    select: {
      amount: true,
      currency: true,
      url: true,
      mimeType: true,
      booking: true,
      createdAt: true,
    },
    populate: {
      bookings: { start: true, business: true },
      businesses: { name: true, slug: true, _status: true },
    },
  })
  return (rows.docs as unknown as ReceiptDoc[]).map(toMyReceipt)
}
