import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale, type Locale } from '@vardenia/i18n'
import { BOOKING_STATUSES, type BookingStatus } from '@vardenia/core'
import { Link } from '../../../../i18n/routing'
import { currentOwner, ownerBookings } from '../../../../lib/session'
import {
  BOOKING_WINDOWS,
  bookingFilterQuery,
  DEFAULT_FILTER,
  isFiltered,
  parseBookingFilter,
  type BookingFilter,
  type BookingWindow,
} from '../../../../lib/booking-filters'
import { formatBeirut } from '../../../../lib/beirut'
import { LINK, NOTICE_INFO, PRIMARY_BUTTON } from '../../../../components/formStyles'
import { BookingActions } from '../../../../components/BookingActions'
import { SignOutButton } from '../../../../components/SignOutButton'

/**
 * The reservation book: every booking for the listings this account manages,
 * and the buttons that answer them.
 *
 * Until this existed, an owner had no way in at all - only staff could confirm
 * or decline a booking, through the admin panel. That works for the first few
 * venues and stops working immediately after.
 *
 * # It used to be three fixed lists
 *
 * Requests, upcoming and past, all rendered at once. That is the right shape for
 * a venue with four bookings and the wrong one for a venue with four hundred: a
 * restaurant looking for one table on Saturday was scrolling for it, and there
 * was no way to ask a question as ordinary as "who did not turn up last month".
 *
 * Now it is one filtered list, and the filters live in the query string - the
 * same choice as the public directory. Every view is a real address that can be
 * bookmarked, reloaded, or sent to whoever actually answers the phone, and the
 * page stays a server component with no client state to drift out of step.
 *
 * # The filtering is not done here
 *
 * `ownerBookings` runs with the owner's own session and `overrideAccess: false`,
 * so the `{ business: { in: ownedBusinessIds(user) } }` constraint on the
 * Bookings collection is applied in the database. Nothing on this page decides
 * which bookings belong to whom, which is the only arrangement that stays safe
 * when somebody edits this file later. The filters narrow that set; nothing they
 * can say will widen it.
 *
 * Dynamic and noindex: it is somebody's reservation book.
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ status?: string; window?: string; q?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'partner' })
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function PartnerPage({ params, searchParams }: Props) {
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

  const filter = parseBookingFilter(await searchParams)
  const { docs, totalDocs, awaiting } = await ownerBookings(filter)

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
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

      {/* Counted outside the filter and shown above it. A request waiting for an
          answer is the only thing here costing somebody something while it sits,
          so it stays visible while the reader is looking at last month's
          no-shows. It links to the filter rather than rendering a second list -
          the previous version showed pending bookings twice on one page, each
          with its own Accept button, which reads as two requests from the same
          person. */}
      {awaiting > 0 && filter.status !== 'pending' ? (
        <p className={`${NOTICE_INFO} mt-8 flex flex-wrap items-center gap-3`}>
          <span>{t('requestsWaiting', { count: awaiting })}</span>
          <Link href="/partner?status=pending" className={LINK}>
            {t('reviewRequests')}
          </Link>
        </p>
      ) : null}

      <FilterBar filter={filter} locale={locale as Locale} />

      <p className="text-ink-500 mt-6 text-sm">{t('resultCount', { count: totalDocs })}</p>

      {docs.length === 0 ? (
        <p className="text-ink-500 mt-12 text-center">
          {isFiltered(filter) ? t('noMatches') : t('noBookings')}
        </p>
      ) : (
        <BookingList bookings={docs} locale={locale as Locale} />
      )}
    </main>
  )
}

/**
 * The filters, as links and one small form.
 *
 * Links rather than a dropdown, because each one is a view worth having an
 * address for. The search is a plain GET form so that submitting it produces the
 * same kind of URL a chip does, and the browser's own back button undoes it.
 */
async function FilterBar({ filter, locale }: { filter: BookingFilter; locale: Locale }) {
  const t = await getTranslations('partner')
  const status = await getTranslations('bookingStatus')

  const windowLabel: Record<BookingWindow, string> = {
    upcoming: t('windowUpcoming'),
    past: t('windowPast'),
    all: t('windowAll'),
  }

  const href = (next: Partial<BookingFilter>) =>
    `/partner${bookingFilterQuery({ ...filter, ...next })}`

  return (
    <section className="border-ink-100 mt-8 border-t pt-6" aria-label={t('filters')}>
      <div className="flex flex-wrap gap-2">
        {BOOKING_WINDOWS.map((value) => (
          <Chip key={value} href={href({ window: value })} active={filter.window === value}>
            {windowLabel[value]}
          </Chip>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Chip href={href({ status: 'all' })} active={filter.status === 'all'}>
          {t('statusAll')}
        </Chip>
        {BOOKING_STATUSES.map((value) => (
          <Chip key={value} href={href({ status: value })} active={filter.status === value}>
            {status(value)}
          </Chip>
        ))}
      </div>

      {/* `window` and `status` ride along as hidden fields so that searching does
          not silently reset the other filters. */}
      <form action={`/${locale}/partner`} method="get" className="mt-4 flex flex-wrap gap-2">
        {filter.status !== 'all' ? (
          <input type="hidden" name="status" value={filter.status} />
        ) : null}
        {filter.window !== DEFAULT_FILTER.window ? (
          <input type="hidden" name="window" value={filter.window} />
        ) : null}

        <label className="sr-only" htmlFor="partner-search">
          {t('searchLabel')}
        </label>
        <input
          id="partner-search"
          name="q"
          type="search"
          defaultValue={filter.search}
          placeholder={t('searchPlaceholder')}
          className="border-ink-100 text-ink-900 min-w-56 flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button type="submit" className="border-ink-100 rounded-md border px-4 py-2 text-sm">
          {t('searchAction')}
        </button>

        {isFiltered(filter) ? (
          <Link href="/partner" className={`${LINK} self-center text-sm`}>
            {t('clearFilters')}
          </Link>
        ) : null}
      </form>
    </section>
  )
}

function Chip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`rounded-full border px-4 py-1.5 text-sm transition ${
        active
          ? 'border-ink-900 bg-ink-900 text-surface-base'
          : 'border-ink-100 text-ink-700 hover:border-ink-300'
      }`}
    >
      {children}
    </Link>
  )
}

type BookingDoc = Awaited<ReturnType<typeof ownerBookings>>['docs'][number]

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

            <BookingActions id={row.id} status={row.status as BookingStatus} ended={row.ended} />
          </li>
        )
      })}
    </ul>
  )
}
