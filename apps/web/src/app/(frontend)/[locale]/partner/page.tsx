import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale, type Locale } from '@vardenia/i18n'
import type { BookingStatus } from '@vardenia/core'
import { Link } from '../../../../i18n/routing'
import { currentOwner, ownerBookings, partitionBookings } from '../../../../lib/session'
import { formatBeirut } from '../../../../lib/beirut'
import { LINK, NOTICE_INFO, PRIMARY_BUTTON } from '../../../../components/formStyles'
import { BookingActions } from '../../../../components/BookingActions'
import { SignOutButton } from '../../../../components/SignOutButton'

/**
 * What a business owner sees: the bookings for their own listings, and the two
 * buttons that answer them.
 *
 * Until this existed, an owner had no way in at all - only staff could confirm
 * or decline a booking, through the admin panel. That works for the first few
 * venues and stops working immediately after.
 *
 * # The filtering is not done here
 *
 * `ownerBookings` runs with the owner's own session and `overrideAccess: false`,
 * so the `{ business: { in: ownedBusinessIds(user) } }` constraint on the
 * Bookings collection is applied in the database. Nothing on this page decides
 * which bookings belong to whom, which is the only arrangement that stays safe
 * when somebody edits this file later.
 *
 * Dynamic and noindex: it is somebody's reservation book.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'partner' })
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function PartnerPage({ params }: { params: Promise<{ locale: string }> }) {
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

  const bookings = await ownerBookings()
  const { upcoming, past } = partitionBookings(bookings)

  /**
   * Requests needing an answer, lifted out of the list.
   *
   * A pending booking is the only thing on this page that is waiting on the
   * owner, and it is time-sensitive in a way nothing else here is. Leaving it
   * mixed in with confirmed bookings is how a request sits unanswered until the
   * customer turns up.
   */
  const awaiting = upcoming.filter((booking) => booking.status === 'pending')

  /**
   * And taken out of the list below, rather than shown in both.
   *
   * The first version left them in, so a pending booking rendered twice on one
   * page with its own Accept button each time - which reads as two requests from
   * the same person. Obvious the moment the page was looked at, invisible in the
   * code.
   */
  const settled = upcoming.filter((booking) => booking.status !== 'pending')

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-gold-700 text-xs uppercase tracking-[0.2em]">{t('eyebrow')}</p>
          <h1 className="font-display text-ink-900 mt-3 text-3xl">{t('title')}</h1>
          <p className="text-ink-500 mt-2 text-sm">{owner.email}</p>
        </div>
        <SignOutButton collection="business-users" redirectTo="/partner/login" />
      </header>

      {/* An account staff have not yet attached a listing to. It authenticates
          perfectly and can see nothing, which without a word of explanation
          looks like the page is broken. */}
      {owner.businessIds.length === 0 ? (
        <p className={`${NOTICE_INFO} mt-8`}>{t('noListings')}</p>
      ) : null}

      {awaiting.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-ink-900 text-sm font-semibold">
            {t('awaiting', { count: awaiting.length })}
          </h2>
          <BookingList bookings={awaiting} locale={locale as Locale} />
        </section>
      ) : null}

      <section className="mt-12">
        <h2 className="text-ink-300 text-xs uppercase tracking-widest">{t('upcoming')}</h2>
        {settled.length === 0 ? (
          <p className="text-ink-500 mt-4">{t('noBookings')}</p>
        ) : (
          <BookingList bookings={settled} locale={locale as Locale} />
        )}
      </section>

      {past.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-ink-300 text-xs uppercase tracking-widest">{t('past')}</h2>
          <BookingList bookings={past} locale={locale as Locale} />
        </section>
      ) : null}
    </main>
  )
}

type BookingDoc = Awaited<ReturnType<typeof ownerBookings>>[number]

async function BookingList({ bookings, locale }: { bookings: BookingDoc[]; locale: Locale }) {
  const status = await getTranslations('bookingStatus')
  const t = await getTranslations('partner')
  const booking = await getTranslations('booking')

  return (
    <ul className="mt-4 flex flex-col gap-3">
      {bookings.map((row) => {
        const business = row.business
        const name = typeof business === 'object' && business ? (business.name ?? '') : ''

        /**
         * From `guest`, not from the populated relationship, which an owner is
         * not allowed to read. See ownerBookings. A booking whose customer row
         * has gone still renders, with the name simply missing.
         */
        const guestName = row.guest?.name || t('guestUnknown')

        return (
          <li key={row.id} className="border-ink-100 bg-surface-raised rounded-lg border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-ink-900 font-semibold">{guestName}</span>
              <span className="text-ink-500 text-xs uppercase tracking-wider">
                {status(row.status as BookingStatus)}
              </span>
            </div>

            <p className="text-ink-700 mt-2 text-sm">{formatBeirut(new Date(row.start), locale)}</p>

            <p className="text-ink-500 mt-1 text-xs">
              {name} &middot; {t('people', { count: row.partySize })} &middot;{' '}
              {booking('reference')} <span className="select-all font-mono">{row.reference}</span>
            </p>

            {/* The one thing a venue needs when the evening changes. Shown, not
                hidden behind a click: ringing a guest to move a table by an hour
                is the ordinary case, not an exception. */}
            {row.guest?.phone ? (
              <p className="text-ink-500 mt-1 text-xs">
                <a href={`tel:${row.guest.phone}`} className={LINK}>
                  {row.guest.phone}
                </a>
              </p>
            ) : null}

            {/* What the customer asked us to pass on. The reason a kitchen needs
                to read this before the evening, not after. */}
            {row.notes ? (
              <p className="text-ink-700 border-ink-100 mt-3 border-s-2 ps-3 text-sm">
                {row.notes}
              </p>
            ) : null}

            <BookingActions id={row.id} status={row.status as BookingStatus} />
          </li>
        )
      })}
    </ul>
  )
}
