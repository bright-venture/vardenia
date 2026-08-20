import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@vardenia/i18n'
import { redirect } from '../../../../../i18n/routing'
import { CloseAccountForm } from '../../../../../components/CloseAccountForm'
import { currentCustomer, customerBookings, partitionBookings } from '../../../../../lib/session'

/**
 * Closing an account.
 *
 * Its own page rather than a button on the account screen: it is irreversible
 * and it cancels upcoming reservations, so it should take a deliberate
 * navigation to reach.
 *
 * The count of upcoming bookings is worked out here so the warning can be
 * specific. "This will cancel 2 upcoming bookings" is a sentence somebody stops
 * and reads; "this may affect your bookings" is one they scroll past.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'account' })
  return { title: t('closeTitle'), robots: { index: false, follow: false } }
}

export default async function CloseAccountPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  if (!(await currentCustomer())) redirect({ href: '/account/login', locale })

  const bookings = await customerBookings()
  const { upcoming } = partitionBookings(bookings)
  const live = upcoming.filter(
    (booking) => booking.status === 'pending' || booking.status === 'confirmed',
  ).length

  const t = await getTranslations('account')

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="font-display text-ink-900 text-3xl">{t('closeTitle')}</h1>
      <div className="mt-8">
        <CloseAccountForm upcoming={live} />
      </div>
    </main>
  )
}
