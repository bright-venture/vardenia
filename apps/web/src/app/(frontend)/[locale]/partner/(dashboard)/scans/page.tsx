import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { Link } from '../../../../../../i18n/routing'
import { currentOwner } from '../../../../../../lib/session'
import { ownerScanReport, type ScanReport } from '../../../../../../lib/scan-report'
import { PRIMARY_BUTTON } from '../../../../../../components/formStyles'

/**
 * What the printed codes are doing: how often a partner's listings are scanned,
 * where from, and on what.
 *
 * The scan log is staff-only, so the figures are aggregated server-side over the
 * account's own listings - `owner.businessIds`, from the session, never the
 * query string. See lib/scan-report for the aggregation and why the id filter is
 * the whole security boundary.
 *
 * Dynamic and noindex, like the rest of the dashboard: it is a business's own
 * numbers.
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'partner' })
  return { title: t('tabScans'), robots: { index: false, follow: false } }
}

export default async function PartnerScansPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations('partner')
  const owner = await currentOwner()

  if (!owner) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <p className="text-gold-700 text-xs uppercase tracking-[0.2em]">{t('eyebrow')}</p>
        <h1 className="font-display text-ink-900 mt-3 text-3xl">{t('title')}</h1>
        <p className="text-ink-500 mt-4">{t('signInToSee')}</p>
        <Link href="/partner/login" className={`${PRIMARY_BUTTON} mt-8`}>
          {t('signIn')}
        </Link>
      </main>
    )
  }

  const report = await ownerScanReport(owner.businessIds)

  // The page's own locale for formatting, so French dates read in French. The
  // content-only en/ar collapse (dataLocale) is not wanted here.
  const num = (n: number) => n.toLocaleString(locale)

  if (report.total === 0) {
    return (
      <>
        <p className="text-ink-700 mt-8 text-sm leading-relaxed">{t('scansIntro')}</p>
        <p className="border-ink-100 text-ink-500 mt-8 border-s-2 ps-4 text-sm">{t('scansNone')}</p>
      </>
    )
  }

  return (
    <>
      <p className="text-ink-700 mt-8 text-sm leading-relaxed">{t('scansIntro')}</p>

      {/* The three numbers first, before the breakdowns. */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Tile label={t('scansAllTime')} value={num(report.total)} />
        <Tile
          label={t('scansWindow', { days: report.windowDays })}
          value={num(report.windowTotal)}
        />
        <Tile label={t('scansDirect')} value={num(report.direct)} hint={t('scansDirectHint')} />
      </div>

      <ScanChart report={report} label={t('scansPerDay')} locale={locale} />

      <div className="mt-10 grid gap-10 sm:grid-cols-2">
        <Breakdown
          title={t('scansByDevice')}
          rows={report.platforms.map((p) => ({
            label: deviceLabel(p.platform, t),
            count: p.count,
          }))}
          num={num}
        />
        <Breakdown
          title={t('scansByCountry')}
          rows={report.countries.map((c) => ({
            label: c.country || t('countryUnknown'),
            count: c.count,
          }))}
          num={num}
        />
      </div>
    </>
  )
}

function deviceLabel(platform: string, t: (key: string) => string): string {
  switch (platform) {
    case 'ios':
      return t('deviceIos')
    case 'android':
      return t('deviceAndroid')
    case 'web':
      return t('deviceWeb')
    default:
      return t('deviceOther')
  }
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-ink-100 border p-4">
      <p className="text-ink-900 font-mono text-3xl tabular-nums">{value}</p>
      <p className="text-ink-500 mt-1 text-xs uppercase tracking-[0.14em]">{label}</p>
      {hint ? <p className="text-ink-500 mt-1 text-[11px]">{hint}</p> : null}
    </div>
  )
}

/**
 * A bar per day of the window. Pure CSS heights against the busiest day, so it
 * needs no charting library and no client JavaScript. The bars carry the date
 * and count as a title, and the first and last dates are printed under the axis.
 */
function ScanChart({
  report,
  label,
  locale,
}: {
  report: ScanReport
  label: string
  locale: string
}) {
  const max = Math.max(1, ...report.daily.map((d) => d.count))
  const first = report.daily[0]?.day
  const last = report.daily[report.daily.length - 1]?.day
  const fmt = (iso: string | undefined) =>
    iso
      ? new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
        })
      : ''

  return (
    <section className="mt-10">
      <h2 className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.14em]">{label}</h2>
      <div className="mt-4 flex h-28 items-end gap-px" role="img" aria-label={label}>
        {report.daily.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d.count}`}
            className="bg-cedar-900/80 min-h-[2px] flex-1"
            style={{ height: `${(d.count / max) * 100}%` }}
          />
        ))}
      </div>
      <div className="text-ink-500 mt-2 flex justify-between font-mono text-[10px]">
        <span>{fmt(first)}</span>
        <span>{fmt(last)}</span>
      </div>
    </section>
  )
}

function Breakdown({
  title,
  rows,
  num,
}: {
  title: string
  rows: { label: string; count: number }[]
  num: (n: number) => string
}) {
  if (rows.length === 0) return null
  const max = Math.max(1, ...rows.map((r) => r.count))

  return (
    <section>
      <h2 className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.14em]">{title}</h2>
      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-ink-900">{row.label}</span>
              <span className="text-ink-500 font-mono tabular-nums">{num(row.count)}</span>
            </div>
            {/* A proportional rule under each, so the ranking is visible at a glance. */}
            <div className="bg-surface-sunken mt-1 h-1.5 w-full">
              <div
                className="bg-gold-500 h-full"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
