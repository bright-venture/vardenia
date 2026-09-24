import type { AdminViewServerProps } from 'payload'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import {
  isPeriod,
  previousPeriod,
  statementReadyOn,
  statementState,
  type StatementState,
} from '@vardenia/core'
import { beirutDate } from '../../lib/beirut'
import { findEvery } from '../../lib/find-every'

/**
 * Booking fees, in the admin panel: a month of statements, and the two buttons
 * that draw them up and send them.
 *
 *   /admin/billing              last month
 *   /admin/billing?period=2026-10
 *
 * A page in the admin rather than a route of its own, so it sits behind the
 * same sign-in, with the same sidebar, as everything else staff use. The two
 * buttons post to /billing/generate and /billing/send, which check the session
 * again and come back here with a one-line result. Settling a dispute or
 * recording a payment happens on the statement itself, in the Statements list.
 */

interface Row {
  id: number
  number?: string | null
  status: 'draft' | 'sent' | 'paid' | 'void'
  total?: number | null
  dueAt?: string | null
  business?: { name?: string | null } | number | null
  lines?: { disputeOutcome?: string | null }[] | null
}

const STATE_LABEL: Record<StatementState, string> = {
  draft: 'Draft',
  open: 'Sent, awaiting payment',
  overdue: 'Overdue',
  paid: 'Paid',
  void: 'Void',
}

const dollars = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const isStaff = (user: unknown) => {
  const roles = ((user as { roles?: string[] } | null)?.roles ?? []) as string[]
  return (
    (user as { collection?: string } | null)?.collection === 'users' &&
    roles.some((role) => role === 'admin' || role === 'staff')
  )
}

export async function BillingView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult
  const template = {
    i18n: req.i18n,
    locale: initPageResult.locale,
    params,
    payload: req.payload,
    permissions: initPageResult.permissions,
    searchParams,
    user: req.user ?? undefined,
    visibleEntities: initPageResult.visibleEntities,
  }

  // Custom admin views are not behind Payload's own sign-in redirect, so send a
  // signed-out visitor to the login the way every other admin page does.
  if (!req.user) redirect('/admin/login?redirect=%2Fadmin%2Fbilling')

  if (!isStaff(req.user)) {
    return (
      <DefaultTemplate {...template}>
        <Gutter>
          <h1>Booking fees</h1>
          <p>Staff only.</p>
        </Gutter>
      </DefaultTemplate>
    )
  }

  const asked = typeof searchParams?.period === 'string' ? searchParams.period : null
  const today = beirutDate()
  const period = isPeriod(asked) ? asked : previousPeriod(today)
  const readyOn = statementReadyOn(period)
  const ready = today >= readyOn
  const message = typeof searchParams?.message === 'string' ? searchParams.message : null

  const statements = await findEvery<Row>(req.payload, {
    collection: 'statements',
    where: { period: { equals: period } },
    depth: 1,
    overrideAccess: false,
    user: req.user,
    sort: 'number',
  })

  const now = new Date()
  const rows = statements.docs.map((doc) => ({
    id: doc.id,
    number: doc.number ?? '',
    venue: typeof doc.business === 'object' && doc.business ? (doc.business.name ?? '') : '',
    total: Number(doc.total ?? 0),
    state: statementState({ status: doc.status, dueAt: doc.dueAt }, now),
    openDisputes: (doc.lines ?? []).filter((line) => line.disputeOutcome === 'open').length,
  }))

  const drafts = rows.filter((row) => row.state === 'draft').length
  const owed = rows
    .filter((row) => row.state === 'open' || row.state === 'overdue')
    .reduce((sum, row) => sum + row.total, 0)
  const paid = rows.filter((row) => row.state === 'paid').reduce((sum, row) => sum + row.total, 0)

  return (
    <DefaultTemplate {...template}>
      <Gutter>
        <div style={styles.wrap}>
          <h1 style={{ margin: 0 }}>Booking fees, {period}</h1>

          <form method="get" action="/admin/billing" style={styles.row}>
            <input
              name="period"
              defaultValue={period}
              pattern="\d{4}-\d{2}"
              aria-label="Month, like 2026-10"
              style={styles.input}
            />
            <button type="submit" style={styles.secondary}>
              Show month
            </button>
          </form>

          {message ? <p style={styles.note}>{message}</p> : null}

          <div style={styles.stats}>
            <Stat label="Statements" value={String(rows.length)} />
            <Stat label="Drafts" value={String(drafts)} />
            <Stat label="Awaiting payment" value={dollars(owed)} />
            <Stat label="Paid" value={dollars(paid)} />
          </div>

          <div style={styles.row}>
            <form method="post" action="/billing/generate">
              <input type="hidden" name="period" value={period} />
              <button type="submit" disabled={!ready} style={styles.primary}>
                Draw up drafts
              </button>
            </form>
            <form method="post" action="/billing/send">
              <input type="hidden" name="period" value={period} />
              <button type="submit" disabled={drafts === 0} style={styles.secondary}>
                Send {drafts} draft{drafts === 1 ? '' : 's'}
              </button>
            </form>
          </div>

          <p style={styles.muted}>
            {ready
              ? 'Drawing up marks unmarked bookings older than seven days as completed, then creates one draft per venue with a booking fee. Read the drafts before sending: sending emails each venue and starts its deadlines.'
              : `This month can be drawn up from ${readyOn}, once every booking in it has had seven days to be marked.`}
          </p>

          {rows.length === 0 ? (
            <p style={styles.muted}>No statements for this month yet.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Number</th>
                  <th style={styles.th}>Venue</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
                  <th style={styles.th}>State</th>
                  <th style={styles.th}>Disputes</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={styles.td}>{row.number}</td>
                    <td style={styles.td}>{row.venue}</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{dollars(row.total)}</td>
                    <td style={styles.td}>{STATE_LABEL[row.state]}</td>
                    <td style={styles.td}>
                      {row.openDisputes > 0 ? <strong>{row.openDisputes} open</strong> : null}
                    </td>
                    <td style={styles.td}>
                      <Link href={`/admin/collections/statements/${row.id}`}>Open</Link>
                      {' · '}
                      {/* A new tab: the invoice is a printable page outside the admin. */}
                      <a href={`/invoice/${row.id}`} target="_blank" rel="noopener noreferrer">
                        Invoice
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Gutter>
    </DefaultTemplate>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--base)',
    padding: 'calc(var(--base) * 2) 0',
  },
  row: { display: 'flex', gap: 'calc(var(--base) * 0.5)', alignItems: 'center', flexWrap: 'wrap' },
  input: {
    padding: '0.45rem 0.6rem',
    border: '1px solid var(--theme-elevation-250)',
    borderRadius: '4px',
    background: 'var(--theme-input-bg)',
    color: 'var(--theme-elevation-900)',
    width: '9rem',
  },
  primary: {
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    border: '1px solid var(--theme-elevation-900)',
    background: 'var(--theme-elevation-900)',
    color: 'var(--theme-elevation-0)',
    cursor: 'pointer',
  },
  secondary: {
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    border: '1px solid var(--theme-elevation-400)',
    background: 'transparent',
    color: 'var(--theme-elevation-900)',
    cursor: 'pointer',
  },
  note: {
    margin: 0,
    padding: '0.6rem 0.9rem',
    borderLeft: '3px solid var(--theme-elevation-900)',
    background: 'var(--theme-elevation-50)',
  },
  muted: { margin: 0, color: 'var(--theme-elevation-600)', maxWidth: '60rem' },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 'var(--base)',
  },
  stat: {
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '4px',
    padding: 'calc(var(--base) * 0.75)',
  },
  statValue: { fontSize: '1.5rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  statLabel: {
    marginTop: '0.3rem',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--theme-elevation-600)',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    padding: '0.5rem',
    borderBottom: '1px solid var(--theme-elevation-400)',
    fontSize: '0.8rem',
    color: 'var(--theme-elevation-600)',
  },
  td: { padding: '0.5rem', borderBottom: '1px solid var(--theme-elevation-150)' },
}

export default BillingView
