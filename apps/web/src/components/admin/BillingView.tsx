import type { AdminViewServerProps } from 'payload'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import {
  DISPUTE_DAYS,
  PAYMENT_DAYS,
  isPeriod,
  periodBounds,
  previousPeriod,
  statementReadyOn,
  statementState,
  type StatementState,
} from '@vardenia/core'
import { beirutDate } from '../../lib/beirut'
import { findEvery } from '../../lib/find-every'

/**
 * Commissions, in the admin panel: a month of statements, laid out as the five
 * steps the team takes every month, in order.
 *
 *   /admin/billing              last month
 *   /admin/billing?period=2026-10
 *
 * The page used to be four numbers, two buttons and a sentence, which said what
 * there was but not what to do next. So each step now says what it does in
 * plain words, whether it is done, to do now, or still waiting, and carries its
 * own button. The rules behind them are unchanged (lib/statements,
 * core/booking-fees).
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

type StepStatus = 'done' | 'now' | 'next' | 'waiting'

const STEP_PILL: Record<StepStatus, { label: string; className: string }> = {
  done: { label: 'Done', className: 'vd-pill vd-pill--ok' },
  now: { label: 'To do now', className: 'vd-pill vd-pill--warn' },
  next: { label: 'Next', className: 'vd-pill' },
  waiting: { label: 'Not yet', className: 'vd-pill' },
}

const dollars = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** "2026-10" as "October 2026". */
const monthName = (period: string) =>
  new Date(`${period}-15T12:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

/** A YYYY-MM-DD day, or an instant, as "8 November 2026" in Lebanon. */
const dayName = (value: string) =>
  new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: value.length === 10 ? 'UTC' : 'Asia/Beirut',
  })

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

/** Where one bill stands, in a sentence. */
function standing(state: StatementState, dueAt: string | null | undefined): string {
  switch (state) {
    case 'draft':
      return 'Draft: not sent yet'
    case 'open':
      return dueAt ? `Sent, to be paid by ${dayName(dueAt)}` : 'Sent, waiting for payment'
    case 'overdue':
      return dueAt ? `Overdue: was due ${dayName(dueAt)}` : 'Overdue'
    case 'paid':
      return 'Paid'
    case 'void':
      return 'Withdrawn (void)'
  }
}

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
        <main>
          <Gutter>
            <h1>Commissions</h1>
            <p>Staff only.</p>
          </Gutter>
        </main>
      </DefaultTemplate>
    )
  }

  const asked = typeof searchParams?.period === 'string' ? searchParams.period : null
  const today = beirutDate()
  const period = isPeriod(asked) ? asked : previousPeriod(today)
  const earlier = previousPeriod(`${period}-01`)
  const later = periodBounds(period).next.slice(0, 7)
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
    dueAt: doc.dueAt ?? null,
    state: statementState({ status: doc.status, dueAt: doc.dueAt }, now),
    openDisputes: (doc.lines ?? []).filter((line) => line.disputeOutcome === 'open').length,
  }))

  const live = rows.filter((row) => row.state !== 'void')
  const drafts = live.filter((row) => row.state === 'draft')
  const waiting = live.filter((row) => row.state === 'open' || row.state === 'overdue')
  const overdue = live.filter((row) => row.state === 'overdue')
  const paid = live.filter((row) => row.state === 'paid')
  const sum = (list: typeof rows) => list.reduce((total, row) => total + row.total, 0)
  const questions = live.reduce((total, row) => total + row.openDisputes, 0)
  const drawn = live.length > 0

  // Where the month is, step by step. One step is "to do now" at a time.
  const steps: Record<1 | 2 | 3 | 4 | 5, StepStatus> = {
    1: ready ? 'done' : 'now',
    2: !ready ? 'waiting' : drawn ? 'done' : 'now',
    3: drafts.length > 0 ? 'now' : drawn ? 'done' : 'waiting',
    4: drafts.length > 0 ? 'next' : waiting.length + paid.length > 0 ? 'done' : 'waiting',
    5:
      waiting.length > 0 && drafts.length === 0
        ? 'now'
        : drawn && drafts.length === 0 && waiting.length === 0
          ? 'done'
          : 'waiting',
  }

  return (
    <DefaultTemplate {...template}>
      <main>
        <Gutter>
          <div style={styles.wrap}>
            <header style={styles.header}>
              <h1 style={{ margin: 0 }}>Commissions for {monthName(period)}</h1>
              <p style={styles.lead}>
                Once a month, each venue is billed its commission on the guests who booked through
                Vardenia and came. Follow the steps below in order; each one says what it does.
              </p>
            </header>

            <nav aria-label="Month" style={styles.monthBar}>
              <Link href={`/admin/billing?period=${earlier}`} style={styles.secondary}>
                ← {monthName(earlier)}
              </Link>
              <form method="get" action="/admin/billing" style={styles.row}>
                <label htmlFor="vd-billing-month" style={styles.small}>
                  Month
                </label>
                <input
                  id="vd-billing-month"
                  name="period"
                  type="month"
                  defaultValue={period}
                  style={styles.input}
                />
                <button type="submit" style={styles.secondary}>
                  Show
                </button>
              </form>
              <Link href={`/admin/billing?period=${later}`} style={styles.secondary}>
                {monthName(later)} →
              </Link>
            </nav>

            {message ? (
              <p role="status" style={styles.note}>
                {message}
              </p>
            ) : null}

            <ol style={styles.steps}>
              <Step
                n={1}
                status={steps[1]}
                title="Wait for the month to close"
                body={
                  ready ? (
                    <p style={styles.p}>
                      Every booking of {monthName(period)} has had its seven days for the venue to
                      say whether the guest came. The month can be billed.
                    </p>
                  ) : (
                    <p style={styles.p}>
                      Venues have seven days after each visit to mark it, so a visit on the last
                      evening of the month is only settled a week later.{' '}
                      <strong>
                        {monthName(period)} opens on {dayName(readyOn)}
                      </strong>{' '}
                      (in {daysBetween(today, readyOn)} day
                      {daysBetween(today, readyOn) === 1 ? '' : 's'}). Until then the buttons below
                      stay off.
                    </p>
                  )
                }
              />

              <Step
                n={2}
                status={steps[2]}
                title="Prepare the bills"
                body={
                  <>
                    <ul style={styles.list}>
                      <li>
                        Visits a venue confirmed but never marked count as &quot;the guest
                        came&quot;.
                      </li>
                      <li>
                        Each visit is billed a percentage of what the guest spent: the receipt total
                        first, then the venue&apos;s figure, then the guest&apos;s estimate.
                      </li>
                      <li>
                        One bill is made per venue that owes something, as a draft only the team can
                        see. A venue that already has a bill for the month is left alone.
                      </li>
                    </ul>
                    {drawn ? (
                      <p style={styles.p}>
                        {live.length} bill{live.length === 1 ? '' : 's'} made. Preparing again only
                        adds bills for venues that are still missing one.
                      </p>
                    ) : ready ? (
                      <p style={styles.p}>
                        If nobody visited a venue through Vardenia this month, there is nothing to
                        bill it, and that is normal.
                      </p>
                    ) : null}
                  </>
                }
                action={
                  <form method="post" action="/billing/generate">
                    <input type="hidden" name="period" value={period} />
                    <button
                      type="submit"
                      disabled={!ready}
                      style={ready ? styles.primary : styles.disabled}
                    >
                      {drawn ? 'Prepare again' : 'Prepare the bills'}
                    </button>
                  </form>
                }
              />

              <Step
                n={3}
                status={steps[3]}
                title="Check the drafts"
                body={
                  <p style={styles.p}>
                    {drafts.length > 0
                      ? `${drafts.length} draft${drafts.length === 1 ? '' : 's'} to check, ${dollars(sum(drafts))} in all. Open each one in the list below and look at the visits and amounts. Venues cannot see a draft, so a mistake here costs nothing: fix it on the bill before sending.`
                      : 'Once the bills are prepared, open each draft in the list below and check the visits and amounts before anything goes to a venue.'}
                  </p>
                }
              />

              <Step
                n={4}
                status={steps[4]}
                title="Send the bills to the venues"
                body={
                  <ul style={styles.list}>
                    <li>Each venue gets an email, and the bill appears in its partner account.</li>
                    <li>
                      From then, the venue has {DISPUTE_DAYS} days to question a visit and{' '}
                      {PAYMENT_DAYS} days to pay.
                    </li>
                    <li>
                      A venue with no partner account is not sent anything: its bill stays a draft
                      and is named, so you can give it an account or send it another way.
                    </li>
                  </ul>
                }
                action={
                  <form method="post" action="/billing/send">
                    <input type="hidden" name="period" value={period} />
                    <button
                      type="submit"
                      disabled={drafts.length === 0}
                      style={drafts.length > 0 ? styles.primary : styles.disabled}
                    >
                      {drafts.length > 0
                        ? `Send ${drafts.length} bill${drafts.length === 1 ? '' : 's'}`
                        : 'Nothing to send'}
                    </button>
                  </form>
                }
              />

              <Step
                n={5}
                status={steps[5]}
                title="Record the payments"
                body={
                  <p style={styles.p}>
                    {waiting.length > 0
                      ? `${waiting.length} bill${waiting.length === 1 ? '' : 's'} waiting for payment, ${dollars(sum(waiting))}${overdue.length > 0 ? `, of which ${overdue.length} overdue` : ''}. `
                      : ''}
                    When a venue pays, open its bill and set it to <strong>Paid</strong>. A bill
                    sent with a mistake cannot be edited: set it to <strong>Void</strong> and
                    prepare the month again.
                    {questions > 0
                      ? ` ${questions} visit${questions === 1 ? ' is' : 's are'} questioned by a venue: open the bill to settle ${questions === 1 ? 'it' : 'them'}.`
                      : ''}
                  </p>
                }
              />
            </ol>

            <section aria-label="This month in figures" style={styles.stats}>
              <Stat value={String(live.length)} label="Bills this month" />
              <Stat value={String(drafts.length)} label="Not sent yet" />
              <Stat
                value={dollars(sum(waiting))}
                label={`Waiting for payment${overdue.length > 0 ? `, ${overdue.length} overdue` : ''}`}
              />
              <Stat value={dollars(sum(paid))} label="Paid" />
            </section>

            <section>
              <h2 style={styles.h2}>The bills</h2>
              {rows.length === 0 ? (
                <p style={styles.muted}>
                  {ready
                    ? `No bills for ${monthName(period)} yet. Step 2 prepares them.`
                    : `No bills for ${monthName(period)} yet. They can be prepared from ${dayName(readyOn)}.`}
                </p>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Bill</th>
                      <th style={styles.th}>Venue</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Amount</th>
                      <th style={styles.th}>Where it stands</th>
                      <th style={styles.th}>Questioned</th>
                      <th style={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td style={styles.td}>{row.number}</td>
                        <td style={styles.td}>{row.venue}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{dollars(row.total)}</td>
                        <td style={styles.td}>{standing(row.state, row.dueAt)}</td>
                        <td style={styles.td}>
                          {row.openDisputes > 0 ? (
                            <strong>
                              {row.openDisputes} visit{row.openDisputes === 1 ? '' : 's'}
                            </strong>
                          ) : null}
                        </td>
                        <td style={styles.td}>
                          <Link href={`/admin/collections/statements/${row.id}`}>
                            {row.state === 'draft' ? 'Check' : 'Open'}
                          </Link>
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
            </section>
          </div>
        </Gutter>
      </main>
    </DefaultTemplate>
  )
}

function Step({
  n,
  status,
  title,
  body,
  action,
}: {
  n: number
  status: StepStatus
  title: string
  body: React.ReactNode
  action?: React.ReactNode
}) {
  const pill = STEP_PILL[status]
  const active = status === 'now'
  return (
    <li
      style={{
        ...styles.step,
        borderColor: active ? 'var(--theme-elevation-800)' : 'var(--theme-elevation-150)',
        opacity: status === 'waiting' ? 0.75 : 1,
      }}
      aria-current={active ? 'step' : undefined}
    >
      <div style={styles.stepNumber} aria-hidden="true">
        {status === 'done' ? '✓' : n}
      </div>
      <div style={styles.stepBody}>
        <div style={styles.stepTop}>
          <h2 style={styles.stepTitle}>
            <span style={styles.srOnly}>Step {n}: </span>
            {title}
          </h2>
          <span className={pill.className}>{pill.label}</span>
        </div>
        {body}
        {action ? <div style={{ marginTop: '0.6rem' }}>{action}</div> : null}
      </div>
    </li>
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

const button: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.55rem 1.1rem',
  borderRadius: '4px',
  fontSize: '0.95rem',
  textDecoration: 'none',
  cursor: 'pointer',
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(var(--base) * 1.25)',
    padding: 'calc(var(--base) * 2) 0',
    maxWidth: '64rem',
  },
  header: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  lead: { margin: 0, color: 'var(--theme-elevation-700)', fontSize: '1rem', maxWidth: '48rem' },
  monthBar: { display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' },
  row: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' },
  small: { fontSize: '0.85rem', color: 'var(--theme-elevation-600)' },
  input: {
    padding: '0.45rem 0.6rem',
    border: '1px solid var(--theme-elevation-250)',
    borderRadius: '4px',
    background: 'var(--theme-input-bg)',
    color: 'var(--theme-elevation-900)',
  },
  primary: {
    ...button,
    border: '1px solid var(--theme-elevation-900)',
    background: 'var(--theme-elevation-900)',
    color: 'var(--theme-elevation-0)',
  },
  secondary: {
    ...button,
    border: '1px solid var(--theme-elevation-400)',
    background: 'transparent',
    color: 'var(--theme-elevation-900)',
  },
  disabled: {
    ...button,
    border: '1px solid var(--theme-elevation-200)',
    background: 'var(--theme-elevation-50)',
    color: 'var(--theme-elevation-500)',
    cursor: 'not-allowed',
  },
  note: {
    margin: 0,
    padding: '0.75rem 1rem',
    borderLeft: '3px solid var(--theme-elevation-900)',
    borderRadius: 0,
    background: 'var(--theme-elevation-50)',
  },
  steps: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  step: {
    display: 'flex',
    gap: '1rem',
    padding: '1rem 1.1rem',
    border: '1px solid',
    borderRadius: '6px',
    background: 'var(--theme-elevation-0)',
  },
  stepNumber: {
    flex: '0 0 2rem',
    height: '2rem',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    background: 'var(--theme-elevation-100)',
    color: 'var(--theme-elevation-900)',
  },
  stepBody: { flex: 1, minWidth: 0 },
  stepTop: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: '0.35rem',
  },
  stepTitle: { margin: 0, fontSize: '1.1rem', fontWeight: 600 },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  },
  p: { margin: 0, color: 'var(--theme-elevation-800)', lineHeight: 1.55 },
  list: {
    margin: 0,
    paddingLeft: '1.2rem',
    color: 'var(--theme-elevation-800)',
    lineHeight: 1.55,
  },
  muted: { margin: 0, color: 'var(--theme-elevation-600)' },
  h2: { margin: '0 0 0.6rem', fontSize: '1.15rem' },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 'var(--base)',
  },
  stat: {
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '4px',
    padding: 'calc(var(--base) * 0.75)',
  },
  statValue: { fontSize: '1.5rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  statLabel: { marginTop: '0.3rem', fontSize: '0.85rem', color: 'var(--theme-elevation-600)' },
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
