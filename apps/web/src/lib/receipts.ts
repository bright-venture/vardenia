import type { Payload } from 'payload'
import {
  attendanceMismatch,
  canSendReceipt,
  type AttendanceVerdict,
  type BookingStatus,
  type GuestAnswer,
} from '@vardenia/core'
import { alertTeam, recordGuestAnswer } from './attendance'
import { readSpent } from './spent'
import { RECEIPT_CURRENCIES } from '../collections/Receipts'
import { openReading, readingConcerns } from './receipt-reading'

/**
 * A guest sending the receipt of a visit (collections/Receipts).
 *
 * Reached from the "Did you go?" page, which the email, the account page and
 * the passport all link to, through the booking's signed token: the token is
 * the permission, so the guest needs no sign-in, and the write overrides access
 * because `create` on Receipts is staff-only by design.
 */

/**
 * Under Netlify's request limit (about 6 MB), with room for the form around
 * the file. The page shrinks a large photo before sending (ReceiptPicker), so
 * a phone camera's full-size picture still fits.
 */
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024

export type ReceiptCurrency = (typeof RECEIPT_CURRENCIES)[number]

export type ReceiptType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

/**
 * What a file really is, from its first bytes.
 *
 * The browser's own label and the file's name are whatever the sender says
 * they are; the bytes are not. Anything other than the four formats a receipt
 * comes in is refused before it is stored.
 */
export function receiptType(bytes: Uint8Array): ReceiptType | null {
  const at = (i: number) => bytes[i] ?? -1
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg'
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'image/png'
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (ascii(0, 5) === '%PDF-') return 'application/pdf'
  return null
}

const EXTENSION: Record<ReceiptType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

/** The ceiling on a typed total, per currency: a guard against typos, not a price. */
const CEILING: Record<ReceiptCurrency, number> = { USD: 1_000_000, LBP: 100_000_000_000 }

export const readCurrency = (raw: unknown): ReceiptCurrency =>
  (RECEIPT_CURRENCIES as readonly string[]).includes(String(raw)) ? (raw as ReceiptCurrency) : 'USD'

export const readReceiptAmount = (raw: unknown, currency: ReceiptCurrency) =>
  readSpent(raw, CEILING[currency])

export type ReceiptOutcome =
  | 'saved'
  | 'already'
  | 'duplicate'
  | 'closed'
  | 'not-found'
  | 'no-file'
  | 'bad-file'
  | 'too-big'
  | 'no-amount'

interface BookingRow {
  id: number
  status: BookingStatus
  start: string
  end: string
  business?: number | { id: number } | null
  guestAnswer?: GuestAnswer | null
  receipt?: unknown
}

/**
 * Whether this receipt was already sent, for another visit to the same place.
 *
 * Asked for by the owner on 6 November 2026: one receipt must count once, so
 * that two guests (or one guest twice) cannot claim the same bill. The receipt
 * number read from the photo is the key, within one place, because two places
 * can each print a receipt 0045.
 *
 * Some tills start their numbering again every day, so when both receipts have
 * a printed date and the dates differ, they are two receipts. Only the same
 * number with the same date, or with a date missing on either, is a repeat.
 * Without a number nothing can be compared; that receipt is let through and
 * flagged for the team instead (the `number` concern).
 */
export async function isRepeatedReceipt(
  payload: Payload,
  businessId: number,
  reading: { number: string | null; date: string | null },
): Promise<boolean> {
  if (!reading.number) return false
  const found = await payload.find({
    collection: 'receipts',
    where: {
      and: [
        { 'reading.number': { equals: reading.number } },
        { 'booking.business': { equals: businessId } },
      ],
    },
    depth: 0,
    limit: 50,
    overrideAccess: true,
  })
  return (found.docs as { reading?: { date?: string | null } | null }[]).some((other) => {
    const printed = other.reading?.date ?? null
    return !printed || !reading.date || printed === reading.date
  })
}

interface LinkedBooking extends BookingRow {
  attendanceVerdict?: AttendanceVerdict | null
  amount?: number | null
  guestAmount?: number | null
  receiptAmount?: number | null
}

/**
 * Saves the receipt and links it to the booking, once.
 *
 * In this order, so a refusal costs nothing: the visit is checked, the file is
 * checked, the guest's "I came" is recorded if they had not answered, then the
 * file is stored and linked. The link is written only where none exists, so two
 * tabs sending at once keep the first receipt and the second file is removed.
 *
 * `reading` is what the page had read from this photo (lib/receipt-reading),
 * sealed. It is kept, for the team, only when the seal matches this booking
 * and these exact bytes; anything else is ignored, never refused.
 */
export async function saveReceipt(
  payload: Payload,
  bookingId: number,
  input: {
    bytes: Uint8Array | null
    amount: number | null
    currency: ReceiptCurrency
    reading?: string | null
  },
  now: Date = new Date(),
): Promise<ReceiptOutcome> {
  const doc = (await payload
    .findByID({ collection: 'bookings', id: bookingId, depth: 0, overrideAccess: true })
    .catch(() => null)) as unknown as BookingRow | null
  if (!doc) return 'not-found'
  if (doc.receipt) return 'already'
  const facts = {
    status: doc.status,
    end: new Date(doc.end),
    guestAnswer: doc.guestAnswer ?? null,
    hasReceipt: false,
  }
  if (!canSendReceipt(facts, now)) return 'closed'

  if (!input.bytes || input.bytes.length === 0) return 'no-file'
  if (input.bytes.length > RECEIPT_MAX_BYTES) return 'too-big'
  const type = receiptType(input.bytes)
  if (!type) return 'bad-file'
  if (input.amount === null) return 'no-amount'

  // Before anything is recorded, so a repeated receipt changes nothing.
  const read = input.reading ? openReading(input.reading, bookingId, input.bytes) : null
  const businessId = typeof doc.business === 'object' ? doc.business?.id : doc.business
  if (read && businessId && (await isRepeatedReceipt(payload, Number(businessId), read))) {
    return 'duplicate'
  }

  // A receipt is an answer: the guest came. Their typed total doubles as their
  // figure when it is in dollars, the currency the commission is billed in.
  if (!doc.guestAnswer) {
    await recordGuestAnswer(
      payload,
      bookingId,
      'came',
      now,
      input.currency === 'USD' ? input.amount : null,
    )
  }

  const reading = read
    ? {
        ...read,
        concerns: readingConcerns(
          read,
          { amount: input.amount, currency: input.currency },
          new Date(doc.start),
        ),
      }
    : undefined

  const receipt = (await payload.create({
    collection: 'receipts',
    data: {
      booking: bookingId,
      amount: input.amount,
      currency: input.currency,
      reading,
    } as never,
    file: {
      data: Buffer.from(input.bytes),
      mimetype: type,
      name: `receipt.${EXTENSION[type]}`,
      size: input.bytes.length,
    },
    depth: 0,
    overrideAccess: true,
  })) as { id: number }

  const linked = await payload.update({
    collection: 'bookings',
    where: { and: [{ id: { equals: bookingId } }, { receipt: { exists: false } }] },
    data: { receipt: receipt.id } as never,
    depth: 0,
    overrideAccess: true,
    context: { attendance: true },
  })
  if (linked.docs.length === 0) {
    await payload.delete({ collection: 'receipts', id: receipt.id, overrideAccess: true })
    return 'already'
  }

  // The link stamped the receipt's total on the booking (hooks/stampReceiptAmount)
  // and the dispute flag read it, but this write does not email the team (its
  // context is the guest's own). So the email is sent from here, once, when it
  // is the receipt that opened a dispute.
  const booking = linked.docs[0] as unknown as LinkedBooking
  const mismatch = (receiptAmount: number | null) =>
    attendanceMismatch({
      status: booking.status,
      end: new Date(booking.end),
      guestAnswer: booking.guestAnswer ?? null,
      verdict: booking.attendanceVerdict ?? null,
      amount: booking.amount ?? null,
      guestAmount: booking.guestAmount ?? null,
      receiptAmount,
    })
  const opened = mismatch(booking.receiptAmount ?? null)
  if (opened && !mismatch(null)) await alertTeam(payload, bookingId, opened)
  return 'saved'
}
