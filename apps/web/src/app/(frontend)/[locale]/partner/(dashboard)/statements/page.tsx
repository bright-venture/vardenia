import { AccountEmptyState } from '../../../../../../components/account/AccountEmptyState'
import { PageHero } from '../../../../../../components/editorial/PageHero'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { Link } from '../../../../../../i18n/routing'
import { currentOwner } from '../../../../../../lib/session'
import { ownerStatements } from '../../../../../../lib/owner-statements'
import { STATE_KEY, dayLabel, money, monthLabel } from '../../../../../../lib/statement-format'

/**
 * A partner's monthly booking-fee statements, newest first.
 *
 * Only sent and paid statements appear; a draft is the team's working copy.
 * Each row leads to the statement itself, where the lines are and where one can
 * be questioned. Dynamic and noindex, like the rest of the dashboard.
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'partner' })
  return { title: t('tabStatements'), robots: { index: false, follow: false } }
}

export default async function PartnerStatementsPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations('partner')
  const owner = await currentOwner()

  if (!owner) {
    return (
      <main className="vd-account-gate">
        <PageHero title={t('title')} intro={t('signInToSee')} place={5} locale={locale}>
          <Link href="/partner/login" className="vd-button">
            {t('signIn')} <span aria-hidden>↗</span>
          </Link>
        </PageHero>
      </main>
    )
  }

  const statements = await ownerStatements()

  return (
    <>
      <p className="text-ink-700 mt-8 max-w-prose text-sm leading-relaxed">
        {t('statementsIntro')}
      </p>

      {statements.length === 0 ? (
        <AccountEmptyState kind="receipts" message={t('statementsNone')} />
      ) : (
        <div
          className="border-ink-100 focus-visible:outline-gold-500 mt-8 overflow-x-auto border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          role="region"
          aria-label={t('tabStatements')}
          tabIndex={0}
        >
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="sr-only">{t('tabStatements')}</caption>
            <thead>
              <tr className="border-ink-100 text-ink-500 border-b text-start text-xs uppercase tracking-wider">
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t('statementMonth')}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t('statementNumber')}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-medium">
                  {t('statementTotal')}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t('statementDue')}
                </th>
              </tr>
            </thead>
            <tbody>
              {statements.map((statement) => (
                <tr key={statement.id} className="border-ink-100 border-b">
                  <td className="px-4 py-4">
                    <Link
                      href={`/partner/statements/${statement.id}`}
                      className="text-ink-900 hover:text-gold-700 underline underline-offset-4"
                    >
                      {monthLabel(statement.period, locale)}
                    </Link>
                    {statement.venue ? (
                      <span className="text-ink-500 block text-xs">{statement.venue}</span>
                    ) : null}
                  </td>
                  <td className="text-ink-700 px-4 py-4 font-mono text-xs">{statement.number}</td>
                  <td className="text-ink-900 whitespace-nowrap px-4 py-4 text-end">
                    {money(statement.total, locale)}
                  </td>
                  <td className="px-4 py-4">
                    {statement.state === 'draft' ? null : (
                      <span
                        className={
                          statement.state === 'overdue' ? 'text-state-danger' : 'text-ink-700'
                        }
                      >
                        {t(STATE_KEY[statement.state])}
                      </span>
                    )}
                    {statement.state === 'open' || statement.state === 'overdue' ? (
                      <span className="text-ink-500 block text-xs">
                        {statement.dueAt ? dayLabel(statement.dueAt, locale) : ''}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
