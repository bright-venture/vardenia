import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import { lineCounts, statementState, type StatementStatus } from '@vardenia/core'
import config from '../../../payload.config'
import { BUSINESS_USER_COLLECTION, ownedBusinessIds } from '../../../access/index'
import { isStaffRequest } from '../../../lib/billing-auth'
import { beirutCalendarDayLabel, beirutDate } from '../../../lib/beirut'

const day = (iso: string) => beirutCalendarDayLabel(beirutDate(new Date(iso)), 'en')

/**
 * A statement as a printable invoice.
 *
 *   /invoice/12
 *
 * One page, black on white, meant for the browser's "Save as PDF". Staff can
 * open any statement; a venue only its own, and only once sent - a draft is the
 * team's working copy.
 *
 * English, because an invoice is an accounting document and one language keeps
 * the numbers unambiguous; the statement page in the dashboard is in the
 * reader's own language.
 */

export const dynamic = 'force-dynamic'

interface Line {
  reference?: string | null
  day?: string | null
  unit?: 'guest' | 'night' | 'booking' | null
  quantity?: number | null
  rate?: number | null
  amount?: number | null
  disputeOutcome?: 'none' | 'open' | 'upheld' | 'rejected' | null
}

interface StatementDoc {
  id: number
  number?: string | null
  period?: string | null
  status: StatementStatus
  business?: { id?: number; name?: string | null; address?: string | null } | number | null
  lines?: Line[] | null
  subtotal?: number | null
  vatRate?: number | null
  vat?: number | null
  total?: number | null
  sentAt?: string | null
  dueAt?: string | null
  paidAt?: string | null
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const dollars = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const UNIT: Record<string, string> = { guest: 'guests', night: 'nights', booking: 'booking' }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })

  const statement = (await payload
    .findByID({ collection: 'statements', id: Number(id), depth: 1, overrideAccess: true })
    .catch(() => null)) as StatementDoc | null
  if (!statement) return new Response('Not found.', { status: 404 })

  const staff = await isStaffRequest(payload, request.headers)
  if (!staff) {
    const { user } = await payload.auth({ headers: request.headers }).catch(() => ({ user: null }))
    const businessId =
      typeof statement.business === 'object' ? statement.business?.id : statement.business
    const allowed =
      user?.collection === BUSINESS_USER_COLLECTION &&
      statement.status !== 'draft' &&
      ownedBusinessIds(user).map(String).includes(String(businessId))
    // Someone else's invoice answers exactly like one that does not exist.
    if (!allowed) return new Response('Not found.', { status: 404 })
  }

  const venue = typeof statement.business === 'object' ? statement.business : null
  const state = statementState(statement, new Date())
  // One environment variable, so line breaks are written as \n. See .env.example.
  const instructions = (process.env.BILLING_PAYMENT_INSTRUCTIONS ?? '').replace(/\\n/g, '\n').trim()
  const lines = statement.lines ?? []

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>${escapeHtml(statement.number ?? 'Invoice')} - Vardenia</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font: 11pt/1.5 Georgia, 'Times New Roman', serif; color: #000; max-width: 800px; margin: 32px auto; padding: 0 20px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 12px; }
  .brand { letter-spacing: 4px; text-transform: uppercase; font-size: 13pt; }
  h1 { font-weight: normal; font-size: 20pt; margin: 20px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10pt; }
  th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #bbb; }
  th { border-bottom: 1.5px solid #000; }
  .n { text-align: right; white-space: nowrap; }
  .off td { color: #777; text-decoration: line-through; }
  .totals td { border: none; }
  .totals tr:last-child td { font-weight: bold; border-top: 1.5px solid #000; }
  .box { border: 1px solid #000; padding: 10px 14px; margin-top: 16px; white-space: pre-line; }
  .muted { color: #444; font-size: 9.5pt; }
  .print { margin: 12px 0; }
  @media print { .print { display: none; } body { margin: 0; } }
</style>
</head>
<body>
  <p class="print muted">To keep a copy, use your browser's Print and choose Save as PDF.</p>
  <div class="top">
    <div class="brand">Vardenia</div>
    <div class="n">
      <strong>${escapeHtml(statement.number ?? '')}</strong><br>
      ${statement.sentAt ? `Issued ${escapeHtml(day(statement.sentAt))}<br>` : 'Draft, not issued<br>'}
      ${statement.dueAt ? `Due ${escapeHtml(day(statement.dueAt))}` : ''}
    </div>
  </div>

  <h1>Booking fees, ${escapeHtml(statement.period ?? '')}</h1>
  <p><strong>${escapeHtml(venue?.name ?? '')}</strong>${venue?.address ? `<br>${escapeHtml(venue.address)}` : ''}</p>
  <p class="muted">One line for each guest booking made through Vardenia that took place. No-shows and cancellations are never charged.${state === 'paid' ? ' <strong>Paid.</strong>' : ''}${state === 'void' ? ' <strong>Void.</strong>' : ''}</p>

  <table>
    <thead><tr><th>Date</th><th>Booking</th><th class="n">Quantity</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead>
    <tbody>
      ${lines
        .map(
          (line) => `<tr${lineCounts(line) ? '' : ' class="off"'}>
        <td>${escapeHtml(line.day ?? '')}</td>
        <td>${escapeHtml(line.reference ?? '')}${line.disputeOutcome === 'open' ? ' (questioned)' : ''}${line.disputeOutcome === 'upheld' ? ' (removed)' : ''}</td>
        <td class="n">${Number(line.quantity ?? 0)} ${UNIT[line.unit ?? 'booking'] ?? ''}</td>
        <td class="n">${dollars(Number(line.rate ?? 0))}</td>
        <td class="n">${dollars(Number(line.amount ?? 0))}</td>
      </tr>`,
        )
        .join('\n      ')}
    </tbody>
  </table>

  <table class="totals">
    <tr><td></td><td class="n">Subtotal</td><td class="n" style="width:120px">${dollars(Number(statement.subtotal ?? 0))}</td></tr>
    ${Number(statement.vatRate ?? 0) > 0 ? `<tr><td></td><td class="n">VAT ${Number(statement.vatRate)}%</td><td class="n">${dollars(Number(statement.vat ?? 0))}</td></tr>` : ''}
    <tr><td></td><td class="n">Total</td><td class="n">${dollars(Number(statement.total ?? 0))}</td></tr>
  </table>

  <div class="box"><strong>How to pay</strong>
${escapeHtml(instructions || 'Payment details are sent with this statement. Please quote the statement number.')}</div>
</body>
</html>`

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
