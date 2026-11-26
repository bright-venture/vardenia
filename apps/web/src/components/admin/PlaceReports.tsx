import type { AdminViewServerProps } from 'payload'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { PAGE_LAYOUT_LABELS } from '@vardenia/core'
import { formatMoney } from '../../lib/place-payment-rules'
import {
  CONTRACT_WINDOW_DAYS,
  canSeePlaceReports,
  loadPlaceReports,
  parseWeeks,
  type MoneyLine,
  type OwedLine,
} from '../../lib/place-reports'

/**
 * Magazine Places reports, admin only (PRD v4 A16): /admin/place-reports.
 *
 * Week by week, every money entry the team recorded, laid out to tick off
 * against the Whish history (sender number and Whish time first), then the
 * refunds still to send, the downpayments kept, and the contracts ending in
 * the next 30 days. Read-only: every action is on the listing itself.
 *
 * The role is checked here on the server and again in lib/place-reports
 * before anything is read; a staff member gets a plain refusal.
 */

const LISTING = (id: number | string) => `/admin/collections/businesses/${id}`

const TYPE_LABEL: Record<MoneyLine['type'], string> = {
  downpayment: 'Downpayment',
  balance: 'Rest of the price',
  refund: 'Refund sent',
}

const METHOD_LABEL: Record<string, string> = { whish: 'Whish', desk: 'At the desk', cash: 'Cash' }

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

const moment = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Beirut',
  })

const dateOnly = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Beirut',
      })
    : ''

export async function PlaceReports({ initPageResult, params, searchParams }: AdminViewServerProps) {
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

  // Custom admin views are not behind Payload's own sign-in redirect.
  if (!req.user) redirect('/admin/login?redirect=%2Fadmin%2Fplace-reports')

  const weeks = parseWeeks(searchParams?.weeks)
  const reports = canSeePlaceReports(req.user)
    ? await loadPlaceReports(req.payload, req.user, { weeks })
    : null

  if (!reports) {
    return (
      <DefaultTemplate {...template}>
        <main>
          <Gutter>
            <h1>Magazine places reports</h1>
            <p>Only an admin can see this page.</p>
          </Gutter>
        </main>
      </DefaultTemplate>
    )
  }

  return (
    <DefaultTemplate {...template}>
      <main>
        <Gutter>
          <div style={styles.page}>
            <header>
              <h1 style={styles.title}>Magazine places reports</h1>
              <p style={styles.hint}>
                Money entries since {dayLabel(reports.fromDay)} ({reports.weeks} weeks). Show{' '}
                {[4, 8, 26, 52].map((n, i) => (
                  <span key={n}>
                    {i > 0 ? ' · ' : ''}
                    <Link href={`/admin/place-reports?weeks=${n}`}>{n} weeks</Link>
                  </span>
                ))}
                . Undone entries are left out.
              </p>
            </header>

            <section>
              <h2 style={styles.heading}>Money entries, week by week</h2>
              <p style={styles.hint}>
                Compare each line with the Whish history: the sender number, then the time. A
                transfer in Whish with no line here was not recorded.
              </p>
              {reports.moneyWeeks.length === 0 ? (
                <p>No money was recorded in these weeks.</p>
              ) : (
                reports.moneyWeeks.map((week) => (
                  <div key={week.start} style={styles.card}>
                    <h3 style={styles.weekTitle}>
                      Week of {dayLabel(week.start)}
                      <span style={styles.totals}>
                        {formatMoney(week.received)} received
                        {week.refunded > 0 ? ` · ${formatMoney(week.refunded)} refunded` : ''}
                      </span>
                    </h3>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>When</th>
                          <th style={styles.th}>Sender number</th>
                          <th style={styles.th}>Amount</th>
                          <th style={styles.th}>What</th>
                          <th style={styles.th}>Listing</th>
                          <th style={styles.th}>Recorded by</th>
                          <th style={styles.th}>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {week.lines.map((line, i) => (
                          <tr key={`${line.businessId}-${line.at}-${i}`}>
                            <td style={styles.td}>{moment(line.at)}</td>
                            <td style={styles.td}>
                              {line.senderNumber ?? (line.method ? METHOD_LABEL[line.method] : '')}
                            </td>
                            <td style={{ ...styles.td, ...styles.num }}>
                              {line.type === 'refund' ? '−' : ''}
                              {formatMoney(line.amount, line.currency)}
                            </td>
                            <td style={styles.td}>{TYPE_LABEL[line.type]}</td>
                            <td style={styles.td}>
                              <Link href={LISTING(line.businessId)}>{line.name}</Link>
                              {line.reference ? ` (${line.reference})` : ''}
                            </td>
                            <td style={styles.td}>{line.recordedBy ?? ''}</td>
                            <td style={styles.td}>{line.note ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </section>

            <section>
              <h2 style={styles.heading}>Layout sales, by issue</h2>
              <p style={styles.hint}>
                Held is a listing number taken under that layout and not closed. Sold is fully paid
                or published. Expected is the price fixed when each listing was started; received is
                the money recorded, undone entries and refunds left out.
              </p>
              {reports.layoutSales.length === 0 ? (
                <p>No issue has a template yet.</p>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Issue</th>
                      <th style={styles.th}>Layout</th>
                      <th style={styles.th}>Slots</th>
                      <th style={styles.th}>Held</th>
                      <th style={styles.th}>Sold</th>
                      <th style={styles.th}>Expected</th>
                      <th style={styles.th}>Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.layoutSales.map((row) => (
                      <tr key={`${row.issueId}-${row.layout}`}>
                        <td style={styles.td}>{row.issueTitle}</td>
                        <td style={styles.td}>{PAGE_LAYOUT_LABELS[row.layout]}</td>
                        <td style={{ ...styles.td, ...styles.num }}>{row.slots}</td>
                        <td style={{ ...styles.td, ...styles.num }}>{row.held}</td>
                        <td style={{ ...styles.td, ...styles.num }}>{row.sold}</td>
                        <td style={{ ...styles.td, ...styles.num }}>{formatMoney(row.expected)}</td>
                        <td style={{ ...styles.td, ...styles.num }}>{formatMoney(row.received)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <Owed
              title="Refunds still to send"
              empty="No refund is waiting."
              hint="Not accepted after paying. Send each by Whish to the number it came from, then press Refund sent on the listing."
              lines={reports.refunds}
              sinceLabel="Rejected"
            />

            <Owed
              title="Downpayments kept"
              empty="No downpayment has been kept."
              hint="The owner did not pay the rest in time, so what was paid was kept, as the terms say."
              lines={reports.kept}
              sinceLabel="Rejected"
            />

            <section>
              <h2 style={styles.heading}>
                Contracts ending in the next {CONTRACT_WINDOW_DAYS} days
              </h2>
              {reports.contracts.length === 0 ? (
                <p>None.</p>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Listing</th>
                      <th style={styles.th}>Ends</th>
                      <th style={styles.th}>Live</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.contracts.map((c) => (
                      <tr key={c.businessId}>
                        <td style={styles.td}>
                          <Link href={LISTING(c.businessId)}>{c.name}</Link>
                          {c.reference ? ` (${c.reference})` : ''}
                        </td>
                        <td style={styles.td}>{dateOnly(c.endsAt)}</td>
                        <td style={styles.td}>{c.published ? 'Published' : 'Draft'}</td>
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

function Owed({
  title,
  empty,
  hint,
  lines,
  sinceLabel,
}: {
  title: string
  empty: string
  hint: string
  lines: OwedLine[]
  sinceLabel: string
}) {
  const total = lines.reduce((sum, l) => sum + Math.round(l.amount * 100), 0) / 100
  return (
    <section>
      <h2 style={styles.heading}>
        {title}
        {lines.length > 0 ? <span style={styles.totals}>{formatMoney(total)} in all</span> : null}
      </h2>
      <p style={styles.hint}>{hint}</p>
      {lines.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Listing</th>
              <th style={styles.th}>Amount</th>
              <th style={styles.th}>{sinceLabel}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.businessId}>
                <td style={styles.td}>
                  <Link href={LISTING(line.businessId)}>{line.name}</Link>
                  {line.reference ? ` (${line.reference})` : ''}
                </td>
                <td style={{ ...styles.td, ...styles.num }}>
                  {formatMoney(line.amount, line.currency)}
                </td>
                <td style={styles.td}>{dateOnly(line.since)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(var(--base) * 2)',
    padding: 'calc(var(--base) * 2) 0 calc(var(--base) * 4)',
    maxWidth: '1100px',
  },
  title: { margin: 0, fontSize: '2rem', fontWeight: 600 },
  heading: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: '0.75rem',
    margin: '0 0 0.5rem',
    fontSize: '1.1rem',
    fontWeight: 600,
  },
  weekTitle: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: '0.75rem',
    margin: '0 0 0.5rem',
    fontSize: '0.95rem',
  },
  totals: {
    fontSize: '0.85rem',
    fontWeight: 400,
    color: 'var(--theme-elevation-700)',
    fontVariantNumeric: 'tabular-nums',
  },
  hint: { margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--theme-elevation-700)' },
  card: {
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '8px',
    padding: 'var(--base)',
    background: 'var(--theme-elevation-0)',
    marginBottom: 'var(--base)',
    overflowX: 'auto',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: {
    textAlign: 'left',
    padding: '0.35rem 0.5rem',
    borderBottom: '1px solid var(--theme-elevation-150)',
    color: 'var(--theme-elevation-700)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '0.35rem 0.5rem',
    borderBottom: '1px solid var(--theme-elevation-100)',
    verticalAlign: 'top',
  },
  num: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
}
