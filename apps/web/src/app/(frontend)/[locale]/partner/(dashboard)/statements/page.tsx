import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { Link } from '../../../../../../i18n/routing'
import { currentOwner } from '../../../../../../lib/session'
import { ownerStatements } from '../../../../../../lib/owner-statements'
import { STATE_KEY, dayLabel, money, monthLabel } from '../../../../../../lib/statement-format'
import { PRIMARY_BUTTON } from '../../../../../../components/formStyles'

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

  const statements = await ownerStatements()

  return (
    <>
      <p className="text-ink-700 mt-8 max-w-prose text-sm leading-relaxed">
        {t('statementsIntro')}
      </p>

      {statements.length === 0 ? (
        <p className="border-ink-100 text-ink-500 mt-8 border-s-2 ps-4 text-sm">
          {t('statementsNone')}
        </p>
      ) : (
        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-ink-100 text-ink-500 border-b text-start text-xs uppercase tracking-wider">
              <th className="py-2 text-start font-medium">{t('statementMonth')}</th>
              <th className="py-2 text-start font-medium">{t('statementNumber')}</th>
              <th className="py-2 text-end font-medium">{t('statementTotal')}</th>
              <th className="py-2 ps-4 text-start font-medium">{t('statementDue')}</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((statement) => (
              <tr key={statement.id} className="border-ink-100 border-b">
                <td className="py-3">
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
                <td className="text-ink-700 py-3 font-mono text-xs">{statement.number}</td>
                <td className="text-ink-900 py-3 text-end">{money(statement.total, locale)}</td>
                <td className="py-3 ps-4">
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
      )}
    </>
  )
}
