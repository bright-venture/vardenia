import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import { CATEGORIES, GOVERNORATES } from '@vardenia/core'
import config from '../../../payload.config'
import { staffUser } from '../../../lib/billing-auth'
import { toCsv, UTF8_BOM, type CsvValue } from '../../../lib/csv'
import {
  FLAG_LABELS,
  noShowRate,
  performanceReport,
  reportPeriod,
  type BusinessPerformance,
  type PerformanceReport,
} from '../../../lib/performance-report'

/**
 * The monthly performance report.
 *
 *   /reports/performance                       this month, the businesses needing attention
 *   /reports/performance?month=2026-10&show=all every published listing
 *   /reports/performance?business=123          one business, printable, to send to it
 *   /reports/performance?format=csv            the whole month as a spreadsheet
 *
 * Staff only. These are one business's commercial figures, and the flags are
 * the team's judgement, not something a venue reads about a competitor. The
 * per-business page leaves out the suggestions marked for the team.
 */

export const dynamic = 'force-dynamic'

const GOVERNORATE = new Map<string, string>(GOVERNORATES.map((g) => [g.slug, g.en]))
const DISTRICT = new Map<string, string>(
  GOVERNORATES.flatMap((g) => g.districts.map((d) => [d.slug, d.en] as [string, string])),
)
const CATEGORY = new Map<string, string>(CATEGORIES.map((c) => [c.slug, c.en]))

const escape = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const area = (b: BusinessPerformance) =>
  [
    b.district ? DISTRICT.get(b.district) : null,
    b.governorate ? GOVERNORATE.get(b.governorate) : null,
  ]
    .filter(Boolean)
    .filter((v, i, all) => all.indexOf(v) === i)
    .join(', ')

const pct = (v: number | null) => (v === null ? '-' : `${Math.round(v * 100)}%`)

const monthName = (period: string) =>
  new Date(`${period}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

const place = (p: { city: string | null; country: string | null }) =>
  [p.city ?? 'City not known', p.country].filter(Boolean).join(', ')

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config })
  if (!(await staffUser(payload, request.headers))) {
    return new Response('Staff only. Sign in to the admin panel first.', { status: 403 })
  }

  const url = new URL(request.url)
  const period = reportPeriod(url.searchParams.get('month'))
  const report = await performanceReport(payload, period)

  if (url.searchParams.get('format') === 'csv') return csv(report)

  const businessId = Number(url.searchParams.get('business'))
  if (Number.isInteger(businessId) && businessId > 0) {
    const one = report.businesses.find((b) => b.id === businessId)
    if (!one) return new Response('No published listing with that id.', { status: 404 })
    return html(businessPage(one, report))
  }

  return html(overviewPage(report, url.searchParams.get('show') === 'all'))
}

const html = (body: string) =>
  new Response(body, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })

function csv(report: PerformanceReport): Response {
  const headers = [
    'Business',
    'Area',
    'Category',
    'Tier',
    'Featured',
    'Partner account',
    'Bookings on',
    'Scans',
    `Scans ${report.periodBefore}`,
    'Top place',
    'Requests',
    'Confirmed',
    'Completed',
    'No-shows',
    'No-show rate',
    'Cancelled',
    'Guest said came',
    'Guest said not',
    'Disputes',
    'Guests',
    'Answer hours',
    'Flags',
    'Suggestions',
  ]
  const rows: CsvValue[][] = report.businesses.map((b) => [
    b.name,
    area(b),
    b.category ? (CATEGORY.get(b.category) ?? b.category) : '',
    b.tier,
    b.featured,
    b.hasPartner,
    b.bookingsOn,
    b.scans,
    b.scansBefore,
    b.places[0] ? place(b.places[0]) : '',
    b.requests,
    b.confirmed,
    b.completed,
    b.noShows,
    pct(noShowRate(b)),
    b.cancelled,
    b.came,
    b.absent,
    b.disputes,
    b.guests,
    b.answerHours,
    b.flags.map((f) => FLAG_LABELS[f]).join('; '),
    b.suggestions.map((s) => (s.forTeam ? `[team] ${s.text}` : s.text)).join(' | '),
  ])
  return new Response(UTF8_BOM + toCsv(headers, rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="vardenia-performance-${report.period}.csv"`,
      'cache-control': 'no-store',
    },
  })
}

const STYLE = `
  :root { color-scheme: light; --ink:#16130f; --muted:#6b645b; --line:#e3ddd3; --soft:#f7f4ef; --warn:#8a5a00; --warn-bg:#fff6e3; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; margin: 0; color: var(--ink); background: #fff; font-size: 14px; line-height: 1.45; }
  .wrap { max-width: 1280px; margin: 0 auto; padding: 28px 32px 48px; }
  h1 { font-size: 24px; margin: 0; } h2 { font-size: 16px; margin: 28px 0 10px; }
  .muted { color: var(--muted); }
  .bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 16px 0 0; font-size: 13px; }
  .bar a, .bar button, .bar select, .bar input { font: inherit; padding: 6px 10px; border: 1px solid #cfc7bb; border-radius: 6px; color: var(--ink); background: #fff; text-decoration: none; }
  .bar a.on { background: var(--ink); color: #fff; border-color: var(--ink); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin: 18px 0 0; }
  .tile { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; background: var(--soft); }
  .tile b { display: block; font-size: 22px; } .tile span { font-size: 12px; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); background: var(--soft); position: sticky; top: 0; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  .flag { display: inline-block; font-size: 11px; padding: 1px 7px; margin: 0 4px 3px 0; border-radius: 999px; background: var(--warn-bg); color: var(--warn); border: 1px solid #f0d9a8; }
  ul.tips { margin: 6px 0 0 18px; padding: 0; } ul.tips li { margin: 4px 0; }
  .team { color: var(--muted); font-style: italic; }
  @media print { .bar, .noprint { display: none; } .wrap { padding: 0; } th { position: static; } }
`

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} - Vardenia</title><style>${STYLE}</style></head><body><div class="wrap">${body}</div></body></html>`
}

function monthPicker(period: string, extra: string): string {
  return `<form class="bar" method="get" action="/reports/performance">
    <label>Month <input type="month" name="month" value="${period}"></label>${extra}
    <button type="submit">Show</button>
  </form>`
}

function overviewPage(report: PerformanceReport, all: boolean): string {
  const t = report.totals
  const shown = report.businesses
    .filter((b) => all || b.flags.length > 0)
    .sort((a, b) => b.flags.length - a.flags.length || b.disputes - a.disputes || a.scans - b.scans)
  const q = (show: string) =>
    `/reports/performance?month=${report.period}${show ? `&show=${show}` : ''}`

  const rows = shown
    .map(
      (b) => `<tr>
        <td><a href="/reports/performance?business=${b.id}&month=${report.period}">${escape(b.name)}</a><br><span class="muted">${escape(area(b))}${b.category ? ' · ' + escape(CATEGORY.get(b.category) ?? b.category) : ''}</span></td>
        <td class="n">${b.scans}<br><span class="muted">${b.scansBefore} before</span></td>
        <td>${b.places[0] ? escape(place(b.places[0])) : '<span class="muted">-</span>'}</td>
        <td class="n">${b.requests}</td>
        <td class="n">${b.came}</td>
        <td class="n">${b.noShows} <span class="muted">${pct(noShowRate(b))}</span></td>
        <td class="n">${b.disputes || ''}</td>
        <td class="n">${b.answerHours ?? '-'}</td>
        <td>${b.flags.map((f) => `<span class="flag">${FLAG_LABELS[f]}</span>`).join('')}</td>
      </tr>`,
    )
    .join('')

  return page(
    `Performance ${report.period}`,
    `<h1>Performance, ${monthName(report.period)}</h1>
    <p class="muted">Every published listing, checked for this month. Open a business for its own report, ready to print and send.</p>
    ${monthPicker(report.period, all ? '<input type="hidden" name="show" value="all">' : '')}
    <div class="bar">
      <a href="${q('')}" class="${all ? '' : 'on'}">Needs attention</a>
      <a href="${q('all')}" class="${all ? 'on' : ''}">All listings</a>
      <a href="/reports/performance?month=${report.period}&format=csv">Download CSV</a>
    </div>
    <div class="tiles">
      <div class="tile"><b>${t.scans}</b><span>QR scans</span></div>
      <div class="tile"><b>${t.requests}</b><span>Booking requests</span></div>
      <div class="tile"><b>${t.came}</b><span>Guests confirmed they came</span></div>
      <div class="tile"><b>${pct(t.noShowRate)}</b><span>No-show rate overall</span></div>
      <div class="tile"><b>${t.disputes}</b><span>Disputed visits to settle</span></div>
      <div class="tile"><b>${t.medianScans}</b><span>Scans, median listing with a code</span></div>
    </div>
    <h2>${shown.length} ${all ? 'listings' : 'need attention'}</h2>
    <table>
      <tr><th>Business</th><th class="n">Scans</th><th>Top place</th><th class="n">Requests</th><th class="n">Came</th><th class="n">No-shows</th><th class="n">Disputes</th><th class="n">Answer (h)</th><th>Flags</th></tr>
      ${rows || '<tr><td colspan="9" class="muted">Nothing needs attention this month.</td></tr>'}
    </table>`,
  )
}

function businessPage(b: BusinessPerformance, report: PerformanceReport): string {
  const change =
    b.scansBefore > 0
      ? `${b.scans >= b.scansBefore ? '+' : ''}${Math.round(((b.scans - b.scansBefore) / b.scansBefore) * 100)}% on ${monthName(report.periodBefore)}`
      : `${b.scansBefore} in ${monthName(report.periodBefore)}`
  const places = b.places
    .map((p) => `<tr><td>${escape(place(p))}</td><td class="n">${p.scans}</td></tr>`)
    .join('')
  const forBusiness = b.suggestions.filter((s) => !s.forTeam)
  const forTeam = b.suggestions.filter((s) => s.forTeam)

  return page(
    `${b.name} ${report.period}`,
    `<p class="muted noprint"><a href="/reports/performance?month=${report.period}">All businesses</a></p>
    <p class="muted" style="letter-spacing:.2em;text-transform:uppercase;font-size:11px;margin:0">Vardenia</p>
    <h1>${escape(b.name)}</h1>
    <p class="muted">${escape(area(b))} · Your month on Vardenia: ${monthName(report.period)}</p>
    ${monthPicker(report.period, `<input type="hidden" name="business" value="${b.id}">`)}
    <div class="tiles">
      <div class="tile"><b>${b.scans}</b><span>QR scans (${escape(change)})</span></div>
      <div class="tile"><b>${b.requests}</b><span>Booking requests</span></div>
      <div class="tile"><b>${b.confirmed + b.completed}</b><span>Bookings accepted</span></div>
      <div class="tile"><b>${b.came}</b><span>Guests who confirmed they came</span></div>
      <div class="tile"><b>${b.guests}</b><span>People who came</span></div>
      <div class="tile"><b>${b.noShows}</b><span>No-shows (${pct(noShowRate(b))})</span></div>
      <div class="tile"><b>${b.answerHours ?? '-'}</b><span>Hours to answer a request</span></div>
    </div>
    <h2>Where your scans came from</h2>
    ${
      places
        ? `<table><tr><th>Place</th><th class="n">Scans</th></tr>${places}</table>
           <p class="muted">"City not known" is a scan whose city the network did not report.</p>`
        : '<p class="muted">No scans this month.</p>'
    }
    <h2>Bookings</h2>
    <table>
      <tr><th class="n">Requests</th><th class="n">Waiting</th><th class="n">Confirmed</th><th class="n">Completed</th><th class="n">No-show</th><th class="n">Cancelled or declined</th></tr>
      <tr><td class="n">${b.requests}</td><td class="n">${b.pending}</td><td class="n">${b.confirmed}</td><td class="n">${b.completed}</td><td class="n">${b.noShows}</td><td class="n">${b.cancelled}</td></tr>
    </table>
    <h2>Ideas to bring in more guests</h2>
    ${
      forBusiness.length
        ? `<ul class="tips">${forBusiness.map((s) => `<li>${escape(s.text)}</li>`).join('')}</ul>`
        : '<p class="muted">No suggestions this month.</p>'
    }
    ${
      forTeam.length
        ? `<div class="noprint"><h2>For the team</h2><ul class="tips">${forTeam.map((s) => `<li class="team">${escape(s.text)}</li>`).join('')}</ul>
           <p class="muted">${b.flags.map((f) => `<span class="flag">${FLAG_LABELS[f]}</span>`).join('')}</p></div>`
        : ''
    }`,
  )
}
