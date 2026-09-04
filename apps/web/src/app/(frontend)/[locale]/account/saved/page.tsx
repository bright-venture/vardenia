import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale, type Locale } from '@vardenia/i18n'
import { Link } from '../../../../../i18n/routing'
import { currentCustomer } from '../../../../../lib/session'
import { savedListingsForCurrent } from '../../../../../lib/saved'
import { ListingGrid } from '../../../../../components/ListingGrid'
import { LINK, PRIMARY_BUTTON } from '../../../../../components/formStyles'

/**
 * The shortlist as a page.
 *
 * `force-dynamic` and `noindex` for the same reason the account page is: it is
 * one person's list, and the rest of the site is prerendered. The saves are
 * filtered to the signed-in customer by the SavedListings collection's own
 * access rule in the database - see lib/saved, which is why no customer id is
 * written here.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'account' })
  return { title: t('savedTitle'), robots: { index: false, follow: false } }
}

export default async function SavedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations('account')
  const customer = await currentCustomer()

  if (!customer) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <h1 className="font-display text-ink-900 text-3xl">{t('savedTitle')}</h1>
        <p className="text-ink-500 mt-4">{t('signInToSaved')}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/account/login" className={PRIMARY_BUTTON}>
            {t('signIn')}
          </Link>
          <Link href="/account/signup" className={LINK}>
            {t('signUp')}
          </Link>
        </div>
      </main>
    )
  }

  const listings = await savedListingsForCurrent(locale as Locale)

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-ink-900 text-3xl">{t('savedTitle')}</h1>
          <p className="text-ink-500 mt-2 max-w-md text-sm">{t('savedSubtitle')}</p>
        </div>
        <Link href="/account" className={LINK}>
          {t('title')}
        </Link>
      </header>

      {listings.length > 0 ? (
        <div className="mt-12">
          <ListingGrid listings={listings} locale={locale as Locale} empty={t('noSaved')} />
        </div>
      ) : (
        <div className="mt-12">
          <p className="text-ink-500">{t('noSaved')}</p>
          <Link href="/directory" className={`${LINK} mt-3 inline-block`}>
            {t('browse')}
          </Link>
        </div>
      )}
    </main>
  )
}
