import { PageHero } from '../../../../../components/editorial/PageHero'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale, type Locale } from '@vardenia/i18n'
import { Link } from '../../../../../i18n/routing'
import { currentCustomer } from '../../../../../lib/session'
import { passportForCurrent } from '../../../../../lib/passport'
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
      <main className="vd-account-gate">
        <PageHero title={t('title')} intro={t('signInToSee')} place={1} locale={locale}>
          <Link href="/account/login" className="vd-button">
            {account('signIn')} <span aria-hidden>↗</span>
          </Link>
          <Link href="/account/signup" className="vd-text-link">
            {account('signUp')}
          </Link>
        </PageHero>
      </main>
    )
  }

  const passport = await passportForCurrent(locale)
  if (!passport) notFound()

  return <PassportBook holder={customer.name} passport={passport} locale={locale} />
}
