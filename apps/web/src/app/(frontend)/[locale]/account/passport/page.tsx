import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale, type Locale } from '@vardenia/i18n'
import { Link } from '../../../../../i18n/routing'
import { currentCustomer } from '../../../../../lib/session'
import { passportForCurrent } from '../../../../../lib/passport'
import { LINK, PRIMARY_BUTTON } from '../../../../../components/formStyles'
import { PassportBook } from '../../../../../components/passport/PassportBook'

/**
 * The Vardenia passport: a stamp for each partner place the guest has been to.
 *
 * Read from their bookings every time; see lib/passport for why there is no
 * stamps table, and core/passport for what earns a stamp. `force-dynamic` and
 * `noindex` for the same reason as the account page: it is one person's record.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'passport' })
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function PassportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()
  const locale = raw as Locale
  setRequestLocale(locale)

  const t = await getTranslations('passport')
  const account = await getTranslations('account')
  const customer = await currentCustomer()

  if (!customer) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <h1 className="font-display text-ink-900 text-3xl">{t('title')}</h1>
        <p className="text-ink-500 mt-4">{t('signInToSee')}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/account/login" className={PRIMARY_BUTTON}>
            {account('signIn')}
          </Link>
          <Link href="/account/signup" className={LINK}>
            {account('signUp')}
          </Link>
        </div>
      </main>
    )
  }

  const passport = await passportForCurrent(locale)
  if (!passport) notFound()

  return <PassportBook holder={customer.name} passport={passport} locale={locale} />
}
