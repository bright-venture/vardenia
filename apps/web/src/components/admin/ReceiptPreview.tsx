'use client'

import { useEffect, useState } from 'react'

/**
 * The guest's receipt, as the team weighs it in a dispute.
 *
 * Receipts are private (collections/Receipts): the file is served by Payload
 * after its read rule, so these requests carry the staff member's own session
 * and a partner who somehow reached this screen would get nothing back.
 */

/** What was read from the photo before the guest confirmed (lib/receipt-reading). */
export interface ReceiptReadingSummary {
  total: number | null
  currency: string | null
  date: string | null
  /** The receipt number read from it, which is checked for repeats. */
  number: string | null
  concerns: string[]
}

export interface ReceiptSummary {
  id: number | string
  booking: number | string | null
  url: string
  isPdf: boolean
  amount: number | null
  currency: string
  sentAt: string
  reading: ReceiptReadingSummary | null
}

const idOf = (value: unknown): number | string | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

function toReading(value: unknown): ReceiptReadingSummary | null {
  const r = value as Record<string, unknown> | null
  if (!r || typeof r !== 'object') return null
  const total = typeof r.total === 'number' && Number.isFinite(r.total) ? r.total : null
  const concerns = Array.isArray(r.concerns)
    ? r.concerns.filter((c): c is string => typeof c === 'string')
    : []
  // A group always comes back, empty when nothing was read.
  if (total === null && !r.date && !r.place && !r.number && concerns.length === 0) return null
  return {
    total,
    currency: typeof r.currency === 'string' ? r.currency : null,
    date: typeof r.date === 'string' && r.date ? r.date : null,
    number: typeof r.number === 'string' && r.number ? r.number : null,
    concerns,
  }
}

/** One receipt document from the REST API, as the boxes show it. */
export function toReceiptSummary(doc: unknown): ReceiptSummary | null {
  const d = doc as Record<string, unknown> | null
  const id = idOf(d)
  if (!d || id === null || typeof d.url !== 'string' || !d.url) return null
  return {
    id,
    booking: idOf(d.booking),
    url: d.url,
    isPdf: d.mimeType === 'application/pdf',
    amount: typeof d.amount === 'number' && Number.isFinite(d.amount) ? d.amount : null,
    currency: typeof d.currency === 'string' && d.currency ? d.currency : 'USD',
    sentAt: typeof d.createdAt === 'string' ? d.createdAt : '',
    reading: toReading(d.reading),
  }
}

const SELECT = ['url', 'mimeType', 'amount', 'currency', 'createdAt', 'booking', 'reading']
  .map((field) => `select[${field}]=true`)
  .join('&')

/** The receipt a booking points at, or null while loading and when there is none. */
export function useReceipt(id: number | string | null): ReceiptSummary | null {
  // Kept with the id it was fetched for, so a stale answer is never shown.
  const [loaded, setLoaded] = useState<{ id: string; receipt: ReceiptSummary | null } | null>(null)
  useEffect(() => {
    if (id === null) return
    let cancelled = false
    fetch(`/api/receipts/${encodeURIComponent(String(id))}?depth=0&${SELECT}`, {
      credentials: 'same-origin',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled) setLoaded({ id: String(id), receipt: toReceiptSummary(body) })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [id])
  return id !== null && loaded?.id === String(id) ? loaded.receipt : null
}

const EMPTY = new Map<string, ReceiptSummary>()

/**
 * The receipts sent for several bookings, by booking id, in one request.
 * A booking holds one receipt at most (lib/receipts), so one per key.
 */
export function useReceiptsFor(bookingIds: (number | string)[]): Map<string, ReceiptSummary> {
  const key = [...new Set(bookingIds.map(String))].sort().join(',')
  const [loaded, setLoaded] = useState<{ key: string; receipts: Map<string, ReceiptSummary> }>({
    key: '',
    receipts: EMPTY,
  })
  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetch(
      `/api/receipts?depth=0&limit=100&where[booking][in]=${encodeURIComponent(key)}&${SELECT}`,
      { credentials: 'same-origin' },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled) return
        const found = new Map<string, ReceiptSummary>()
        for (const doc of (body as { docs?: unknown[] } | null)?.docs ?? []) {
          const receipt = toReceiptSummary(doc)
          if (receipt && receipt.booking !== null) found.set(String(receipt.booking), receipt)
        }
        setLoaded({ key, receipts: found })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [key])
  return key && loaded.key === key ? loaded.receipts : EMPTY
}

/** "$84.50" or "2,500,000 LBP": pounds are never shown as dollars. */
export function receiptTotal(amount: number | null, currency: string): string {
  if (amount === null) return 'No total given'
  if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${currency}`
}

const sentOn = (value: string) =>
  value
    ? new Date(value).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Beirut',
      })
    : ''

/** A printed YYYY-MM-DD as "3 Nov 2026", read as the calendar day it names. */
const printedOn = (value: string) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

/** The same wording as the receipt's "To check" field (collections/Receipts). */
const CONCERN_TEXT: Record<string, string> = {
  amount: 'The guest sent another total than the one read.',
  date: 'The printed date is not the visit.',
  place: 'Another business name is on it.',
  unreadable: 'No total could be read from it.',
  number: 'No receipt number could be read, so it was not checked for a repeat.',
}

/** What was read from the photo, and anything in it that does not fit. */
function ReadingLine({ reading }: { reading: ReceiptReadingSummary }) {
  const read = [
    reading.total !== null ? receiptTotal(reading.total, reading.currency ?? 'USD') : null,
    reading.date ? `dated ${printedOn(reading.date)}` : null,
    reading.number ? `receipt no. ${reading.number}` : null,
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <span className="vd-receipt__reading">
      <span className="vd-muted">Read from the photo: {read || 'nothing legible'}</span>
      {reading.concerns.map((concern) => (
        <span key={concern} className="vd-receipt__concern">
          {CONCERN_TEXT[concern] ?? concern}
        </span>
      ))}
    </span>
  )
}

/**
 * The receipt itself: the photo, large enough to read a total from, or a link
 * for a PDF. `compact` is the statement box's size, where several sit together.
 */
export function ReceiptPreview({
  receipt,
  compact = false,
}: {
  receipt: ReceiptSummary
  compact?: boolean
}) {
  const sent = sentOn(receipt.sentAt)
  return (
    <figure className={compact ? 'vd-receipt vd-receipt--compact' : 'vd-receipt'}>
      {receipt.isPdf ? (
        <a className="vd-receipt__pdf" href={receipt.url} target="_blank" rel="noopener noreferrer">
          Open the PDF receipt
        </a>
      ) : (
        <a href={receipt.url} target="_blank" rel="noopener noreferrer" title="Open full size">
          {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind Payload's access check, which next/image would fetch without the session */}
          <img className="vd-receipt__img" src={receipt.url} alt="The receipt the guest sent" />
        </a>
      )}
      <figcaption className="vd-receipt__caption">
        <strong>{receiptTotal(receipt.amount, receipt.currency)}</strong>
        <span className="vd-muted">
          {receipt.amount === null ? 'The guest did not type the total.' : 'as the guest typed it'}
          {sent ? ` · sent ${sent}` : ''}
        </span>
        {receipt.reading ? <ReadingLine reading={receipt.reading} /> : null}
        {receipt.isPdf ? null : (
          <a className="vd-link" href={receipt.url} target="_blank" rel="noopener noreferrer">
            Open full size
          </a>
        )}
      </figcaption>
    </figure>
  )
}
