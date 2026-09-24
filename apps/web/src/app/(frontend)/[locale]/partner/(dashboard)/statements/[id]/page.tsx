import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { Link } from '../../../../../../../i18n/routing'
import { currentOwner } from '../../../../../../../lib/session'
import { ownerStatement } from '../../../../../../../lib/owner-statements'
import { STATE_KEY, dayLabel, money, monthLabel } from '../../../../../../../lib/statement-format'
import { beirutCalendarDayLabel } from '../../../../../../../lib/beirut'
import { DisputeLineForm } from '../../../../../../../components/DisputeLineForm'
import { LINK } from '../../../../../../../components/formStyles'

/**
 * One statement: every billed booking, the total, and where a line can be
 * questioned.
 *
 * The lines are the point. A venue checking a bill wants to find last Tuesday's
 * table of six and see it there, so each line carries the date and the booking
 * reference the dashboard already shows. A statement that is not the owner's,
 * or is still a draft, is a 404 like any other.
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string; id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'partner' })
  return { title: t('tabStatements'), robots: { index: false, follow: false } }
}

export default async function PartnerStatementPage({ params }: Props) {
  const { locale, id } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const owner = await currentOwner()
  if (!owner) notFound()

  const statement = await ownerStatement(Number(id))
  if (!statement || statement.state === 'draft') notFound()

  const t = await getTranslations('partner')
  const perUnit = { guest: t('perGuest'), night: t('perNight'), booking: t('perBooking') }
  const canQuestion = statement.lines.some((line) => line.canDispute)

  return (
    <>
      <p className="mt-8 text-sm">
        <Link href="/partner/statements" className={LINK}>
          {t('statementBack')}
        </Link>
      </p>

      <header className="mt-6 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 className="text-ink-900 text-2xl">{monthLabel(statement.period, locale)}</h2>
          <p className="text-ink-500 mt-1 font-mono text-xs">
            {statement.number}
            {statement.venue ? ` · ${statement.venue}` : ''}
          </p>
        </div>
        <div className="text-end">
          <p className="text-ink-900 text-2xl">{money(statement.total, locale)}</p>
          <p
            className={`text-sm ${statement.state === 'overdue' ? 'text-state-danger' : 'text-ink-700'}`}
          >
            {t(STATE_KEY[statement.state])}
            {(statement.state === 'open' || statement.state === 'overdue') && statement.dueAt
              ? ` · ${t('statementDue')} ${dayLabel(statement.dueAt, locale)}`
              : ''}
          </p>
        </div>
      </header>

      <p className="text-ink-700 mt-6 text-sm">
        {canQuestion && statement.disputeUntil
          ? t('statementDisputeUntil', { date: dayLabel(statement.disputeUntil, locale) })
          : t('statementDisputeClosed')}
      </p>

      <h3 className="text-ink-500 mt-8 font-mono text-[11px] uppercase tracking-[0.14em]">
        {t('statementBookings')}
      </h3>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-ink-100 text-ink-500 border-b text-xs uppercase tracking-wider">
            <th className="py-2 text-start font-medium">{t('statementDate')}</th>
            <th className="py-2 text-start font-medium">{t('statementBooking')}</th>
            <th className="py-2 text-end font-medium">{t('statementQuantity')}</th>
            <th className="py-2 text-end font-medium">{t('statementFee')}</th>
          </tr>
        </thead>
        <tbody>
          {statement.lines.map((line) => {
            const removed = line.disputeOutcome === 'upheld'
            return (
              <tr key={line.id} className="border-ink-100 border-b align-top">
                <td className="py-3">{beirutCalendarDayLabel(line.day, locale)}</td>
                <td className="py-3">
                  <span className="font-mono text-xs">{line.reference}</span>
                  {line.disputeOutcome === 'open' ? (
                    <span className="text-ink-500 block text-xs">{t('disputeOpen')}</span>
                  ) : null}
                  {line.disputeOutcome === 'upheld' ? (
                    <span className="text-ink-500 block text-xs">{t('disputeUpheld')}</span>
                  ) : null}
                  {line.disputeOutcome === 'rejected' ? (
                    <span className="text-ink-500 block text-xs">{t('disputeRejected')}</span>
                  ) : null}
                  {line.canDispute ? (
                    <DisputeLineForm statement={statement.id} line={line.id} />
                  ) : null}
                </td>
                <td className="py-3 text-end">
                  {line.quantity}
                  <span className="text-ink-500 block text-xs">
                    {money(line.rate, locale)} {perUnit[line.unit]}
                  </span>
                </td>
                <td className={`py-3 text-end ${removed ? 'text-ink-500 line-through' : ''}`}>
                  {money(line.amount, locale)}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          {statement.vatRate > 0 ? (
            <>
              <tr>
                <td colSpan={3} className="text-ink-500 py-2 text-end">
                  {t('statementSubtotal')}
                </td>
                <td className="py-2 text-end">{money(statement.subtotal, locale)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="text-ink-500 py-2 text-end">
                  {t('statementVat')} {statement.vatRate}%
                </td>
                <td className="py-2 text-end">{money(statement.vat, locale)}</td>
              </tr>
            </>
          ) : null}
          <tr>
            <td colSpan={3} className="text-ink-900 py-3 text-end font-medium">
              {t('statementTotal')}
            </td>
            <td className="text-ink-900 py-3 text-end font-medium">
              {money(statement.total, locale)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="text-ink-700 mt-8 max-w-prose text-sm leading-relaxed">
        {t('statementHowToPay')}
      </p>
      <p className="mt-3 text-sm">
        {/* A plain link rather than the locale-aware one: /invoice is not a page. */}
        <a href={`/invoice/${statement.id}`} className={LINK}>
          {t('statementInvoice')}
        </a>
      </p>
    </>
  )
}
