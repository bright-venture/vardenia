import type { Payload } from 'payload'
import type { StatementState } from '@vardenia/core'

/**
 * The HTML of the staff /billing page, and the staff check its routes share.
 *
 * A plain page rather than an admin view, like /qr/sheet: two forms and a table,
 * used once a month, and not worth a custom component in the admin bundle.
 */

export async function isStaffRequest(payload: Payload, headers: Headers): Promise<boolean> {
  const { user } = await payload.auth({ headers }).catch(() => ({ user: null }))
  const roles = ((user as { roles?: string[] } | null)?.roles ?? []) as string[]
  return (
    (user as { collection?: string } | null)?.collection === 'users' &&
    roles.some((role) => role === 'admin' || role === 'staff')
  )
}

/**
 * Same-origin check for the two staff form posts.
 *
 * The session cookie is SameSite, which already keeps a cross-site form from
 * carrying it. This is the second lock: a POST whose Origin is another site is
 * refused before anything is read from it.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const dollars = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const STATE_LABEL: Record<StatementState, string> = {
  draft: 'Draft',
  open: 'Sent, awaiting payment',
  overdue: 'Overdue',
  paid: 'Paid',
  void: 'Void',
}

export interface BillingPageInput {
  period: string
  readyOn: string
  ready: boolean
  rows: {
    id: number
    number: string
    venue: string
    total: number
    state: StatementState
    openDisputes: number
  }[]
  message: string | null
}

export function billingPage({ period, readyOn, ready, rows, message }: BillingPageInput): string {
  const drafts = rows.filter((row) => row.state === 'draft').length
  const owed = rows
    .filter((row) => row.state === 'open' || row.state === 'overdue')
    .reduce((sum, row) => sum + row.total, 0)
  const paid = rows.filter((row) => row.state === 'paid').reduce((sum, row) => sum + row.total, 0)

  const table =
    rows.length === 0
      ? '<p class="muted">No statements for this month yet.</p>'
      : `<table>
  <thead><tr><th>Number</th><th>Venue</th><th class="n">Total</th><th>State</th><th>Disputes</th><th></th></tr></thead>
  <tbody>
    ${rows
      .map(
        (row) => `<tr>
      <td>${escapeHtml(row.number)}</td>
      <td>${escapeHtml(row.venue)}</td>
      <td class="n">${dollars(row.total)}</td>
      <td>${STATE_LABEL[row.state]}</td>
      <td>${row.openDisputes > 0 ? `<strong>${row.openDisputes} open</strong>` : ''}</td>
      <td><a href="/admin/collections/statements/${row.id}">Open</a> &middot; <a href="/invoice/${row.id}">Invoice</a></td>
    </tr>`,
      )
      .join('\n    ')}
  </tbody>
</table>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>Billing ${escapeHtml(period)} - Vardenia</title>
<style>
  body { font: 15px/1.55 system-ui, sans-serif; color: #111; max-width: 900px; margin: 40px auto; padding: 0 20px; }
  h1 { font-weight: 600; margin: 0 0 4px; }
  .muted { color: #555; }
  form { display: inline-block; margin: 0 12px 0 0; }
  button { font: inherit; padding: 8px 14px; border: 1px solid #111; background: #111; color: #fff; border-radius: 4px; cursor: pointer; }
  button.secondary { background: #fff; color: #111; }
  button[disabled] { opacity: .4; cursor: not-allowed; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
  td.n, th.n { text-align: right; }
  .note { border-left: 3px solid #111; padding: 6px 12px; margin: 16px 0; background: #f4f4f4; }
  .kpis { display: flex; gap: 24px; margin: 20px 0; }
  .kpis div strong { display: block; font-size: 20px; }
</style>
</head>
<body>
  <p class="muted"><a href="/admin/collections/statements">All statements</a></p>
  <h1>Booking fees, ${escapeHtml(period)}</h1>
  <form method="get" action="/billing"><input name="period" value="${escapeHtml(period)}" size="8" pattern="\\d{4}-\\d{2}"> <button class="secondary" type="submit">Show month</button></form>
  ${message ? `<p class="note">${escapeHtml(message)}</p>` : ''}
  <div class="kpis">
    <div><strong>${rows.length}</strong>statements</div>
    <div><strong>${drafts}</strong>drafts</div>
    <div><strong>${dollars(owed)}</strong>awaiting payment</div>
    <div><strong>${dollars(paid)}</strong>paid</div>
  </div>
  <p>
    <form method="post" action="/billing/generate"><input type="hidden" name="period" value="${escapeHtml(period)}"><button type="submit" ${ready ? '' : 'disabled'}>Draw up drafts</button></form>
    <form method="post" action="/billing/send"><input type="hidden" name="period" value="${escapeHtml(period)}"><button class="secondary" type="submit" ${drafts > 0 ? '' : 'disabled'}>Send ${drafts} draft${drafts === 1 ? '' : 's'}</button></form>
  </p>
  <p class="muted">${
    ready
      ? 'Drawing up marks unmarked bookings older than seven days as completed, then creates one draft per venue with a booking fee. Read the drafts before sending.'
      : `This month can be drawn up from ${escapeHtml(readyOn)}, once every booking in it has had seven days to be marked.`
  }</p>
  ${table}
</body>
</html>`
}
