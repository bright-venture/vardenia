import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale, type Locale } from '@vardenia/i18n'
import type { BookingStatus } from '@vardenia/core'
import { Link } from '../../../../i18n/routing'
import { currentCustomer, customerBookings } from '../../../../lib/session'
import { formatBeirut } from '../../../../lib/beirut'
import { LINK, NOTICE_INFO, PRIMARY_BUTTON } from '../../../../components/formStyles'
import { SignOutButton } from '../../../../components/SignOutButton'

/**
 * What a customer sees of themselves: their bookings, and a way out.
 *
 * # Never cached, never indexed
 *
 * `force-dynamic` because the page is somebody's booking history and the whole
 * site is otherwise prerendered - a cached account page is one reader's
 * reservations served to the next. `noindex` for the same reason one step
 * further out: a crawler that reached this while a session cookie was somehow
 * present would put a customer's name in a search result.
 *
 * The bookings themselves are filtered by the Bookings collection's own access
 * rule, in the database, keyed on the authenticated user. See lib/session for
 * why that constraint is not written here.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'account' })
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations('account')
  const customer = await currentCustomer()

  if (!customer) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <h1 className="font-display text-ink-900 text-3xl">{t('title')}</h1>
        <p className="text-ink-500 mt-4">{t('signInToSee')}</p>
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

  const bookings = await customerBookings()
  const now = Date.now()

  /**
   * Split on the *end* of the booking rather than the start, so a dinner that
   * began an hour ago is still "upcoming" while you are sitting at the table.
   * Splitting on the start moves a booking into the past at the moment it
   * becomes most relevant.
   */
  const upcoming = bookings.filter((b) => new Date(b.end).getTime() >= now)
  const past = bookings.filter((b) => new Date(b.end).getTime() < now)

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-ink-900 text-3xl">{t('title')}</h1>
          <p className="text-ink-500 mt-2 text-sm">{customer.email}</p>
        </div>
        <SignOutButton />
      </header>

      {/* Shown rather than enforced. An unverified customer can still hold
          bookings, because a guest booking creates the record before anybody has
          proven the address - telling them why the verification mail is sitting
          in their inbox is more use than locking the page. */}
      {customer.verified ? null : <p className={`${NOTICE_INFO} mt-8`}>{t('verifyBanner')}</p>}

      <h2 className="text-ink-300 mt-12 text-xs uppercase tracking-widest">{t('bookings')}</h2>

      {bookings.length === 0 ? (
        <div className="mt-6">
          <p className="text-ink-500">{t('noBookings')}</p>
          <Link href="/directory" className={`${LINK} mt-3 inline-block`}>
            {t('browse')}
          </Link>
        </div>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <BookingList title={t('upcoming')} bookings={upcoming} locale={locale as Locale} />
          ) : null}
          {past.length > 0 ? (
            <BookingList title={t('past')} bookings={past} locale={locale as Locale} />
          ) : null}
        </>
      )}
    </main>
  )
}

type BookingDoc = Awaited<ReturnType<typeof customerBookings>>[number]

async function BookingList({
  title,
  bookings,
  locale,
}: {
  title: string
  bookings: BookingDoc[]
  locale: Locale
}) {
  const status = await getTranslations('bookingStatus')
  const t = await getTranslations('booking')

  return (
    <section className="mt-6">
      <h3 className="text-ink-500 text-sm font-semibold">{title}</h3>
      <ul className="mt-3 flex flex-col gap-3">
        {bookings.map((booking) => {
          // depth: 1 resolves the relationship, but a booking whose listing was
          // deleted still has to render rather than crash the page.
          const business = booking.business
          const name = typeof business === 'object' && business ? (business.name ?? '') : ''
          const slug = typeof business === 'object' && business ? (business.slug ?? '') : ''

          return (
            <li key={booking.id} className="border-ink-100 bg-surface-raised rounded-lg border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                {slug ? (
                  <Link href={`/directory/${slug}`} className="text-ink-900 font-semibold">
                    {name}
                  </Link>
                ) : (
                  <span className="text-ink-900 font-semibold">{name}</span>
                )}
                <span className="text-ink-500 text-xs uppercase tracking-wider">
                  {status(booking.status as BookingStatus)}
                </span>
              </div>

              <p className="text-ink-700 mt-2 text-sm">
                {formatBeirut(new Date(booking.start), locale)}
              </p>

              <p className="text-ink-500 mt-1 text-xs">
                {t('reference')} <span className="select-all font-mono">{booking.reference}</span>
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
