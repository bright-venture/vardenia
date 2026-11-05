import { AccountEmptyState } from '../../../../../components/account/AccountEmptyState'
import { PageHero } from '../../../../../components/editorial/PageHero'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { dataLocale, isLocale, type Locale } from '@vardenia/i18n'
import { Link } from '../../../../../i18n/routing'
import { currentCustomer } from '../../../../../lib/session'
import { receiptsForCurrent } from '../../../../../lib/my-receipts'
import { beirutDayLabel } from '../../../../../lib/beirut'
import { LINK } from '../../../../../components/formStyles'

/**
 * "My receipts": every receipt the guest has sent, newest first.
 *
 * `force-dynamic` and `noindex` like the rest of the account: it is one
 * person's papers. The list is filtered to the signed-in guest by the Receipts
 * collection's own read rule (lib/my-receipts), and each "View" link goes
 * through Payload's file route, which checks the same rule before sending the
 * file. Receipts are sent from the "Did you go?" page, which the account and
 * the passport link to; this page only shows them.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'account' })
  return { title: t('receiptsTitle'), robots: { index: false, follow: false } }
}

export default async function ReceiptsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations('account')
  const customer = await currentCustomer()

  if (!customer) {
    return (
      <main data-ui className="vd-account-gate">
        <PageHero
          title={t('receiptsTitle')}
          intro={t('signInToReceipts')}
          place={1}
          locale={locale}
        >
          <Link href="/account/login" className="vd-button">
            {t('signIn')} <span aria-hidden>↗</span>
          </Link>
        </PageHero>
      </main>
    )
  }

  const receipts = await receiptsForCurrent(locale as Locale)
  const day = (date: Date) => beirutDayLabel(date, dataLocale(locale as Locale))
  const money = (amount: number, currency: string) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'LBP' ? 0 : 2,
    }).format(amount)

  return (
    <main data-ui className="vd-receipts-page mx-auto max-w-3xl px-6 py-16">
      <header className="vd-personal-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-ink-900 text-3xl">{t('receiptsTitle')}</h1>
          <p className="text-ink-500 mt-2 max-w-md text-sm">{t('receiptsSubtitle')}</p>
        </div>
        <Link href="/account" className={LINK}>
          {t('title')}
        </Link>
      </header>

      {receipts.length > 0 ? (
        <ul className="mt-10 flex flex-col gap-3">
          {receipts.map((receipt) => (
            <li
              key={receipt.id}
              className="border-ink-100 bg-surface-raised flex flex-wrap items-start justify-between gap-4 border p-4"
            >
              <div>
                {receipt.slug ? (
                  <Link href={`/directory/${receipt.slug}`} className="text-ink-900 font-semibold">
                    {receipt.place}
                  </Link>
                ) : (
                  <span className="text-ink-900 font-semibold">{receipt.place}</span>
                )}
                {receipt.visit ? (
                  <p className="text-ink-700 mt-1 text-sm">
                    {t('receiptVisit', { date: day(receipt.visit) })}
                  </p>
                ) : null}
                <p className="text-ink-500 mt-1 text-xs">
                  {t('receiptSentOn', { date: day(receipt.sentAt) })}
                </p>
              </div>
              <div className="text-end">
                {receipt.amount !== null ? (
                  <p className="text-ink-900 text-lg">{money(receipt.amount, receipt.currency)}</p>
                ) : null}
                {receipt.fileUrl ? (
                  // A plain link, not next/link: the file is served by Payload's
                  // own route, outside the localised pages.
                  <a
                    href={receipt.fileUrl}
                    target="_blank"
                    rel="noopener"
                    className={`${LINK} mt-1 inline-block text-sm`}
                  >
                    {receipt.isPdf ? t('receiptViewPdf') : t('receiptView')}
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <AccountEmptyState
          kind="receipts"
          message={t('noReceipts')}
          action={{ href: '/account', label: t('receiptsGoToBookings') }}
        />
      )}
    </main>
  )
}
