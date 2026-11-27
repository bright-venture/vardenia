/**
 * The review summary on a business's Submission tab: everything staff need to
 * decide, in one readable list. Pure, so what it shows (and does not show) is
 * tested. No payment field is shown: only the price the owner agreed to.
 */

export interface ReviewValues {
  status?: unknown
  ownerName?: unknown
  ownerEmail?: unknown
  ownerPhone?: unknown
  submittedAt?: unknown
  reference?: unknown
  termsVersion?: unknown
  priceAtAcceptance?: unknown
  currency?: unknown
  termMonths?: unknown
  termsAcceptedAt?: unknown
  listingNumber?: unknown
  rejectionReason?: unknown
  rejectedAt?: unknown
}

const text = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''

export function reviewDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Beirut',
  })
}

/** "$20 for 12 months", or the parts that are known. */
export function agreedPrice(values: ReviewValues): string {
  const amount = typeof values.priceAtAcceptance === 'number' ? values.priceAtAcceptance : null
  if (amount === null) return ''
  const currency = text(values.currency).toUpperCase()
  const money = currency === 'USD' || !currency ? `$${amount}` : `${amount} ${currency}`
  const months = typeof values.termMonths === 'number' ? ` for ${values.termMonths} months` : ''
  return `${money}${months}`
}

export function reviewRows(values: ReviewValues): [string, string][] {
  const accepted = reviewDate(values.termsAcceptedAt)
  const price = agreedPrice(values)
  const rows: [string, string][] = [
    ['Reference', text(values.reference)],
    ['Page number', text(values.listingNumber)],
    ['Owner', text(values.ownerName)],
    ['Email', text(values.ownerEmail)],
    ['Phone', text(values.ownerPhone)],
    ['Submitted', reviewDate(values.submittedAt)],
    ['Terms version', text(values.termsVersion)],
    ['Price agreed', price ? (accepted ? `${price}, accepted ${accepted}` : price) : ''],
  ]
  if (values.status === 'rejected') {
    rows.push(['Rejected', reviewDate(values.rejectedAt)])
    rows.push(['Reason', text(values.rejectionReason)])
  }
  return rows.map(([label, value]) => [label, value || 'Not given'])
}
