import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale, type Locale } from '@vardenia/i18n'
import { BOOKING_STATUSES, type BookingStatus } from '@vardenia/core'
import { Link } from '../../../../../i18n/routing'
import { currentOwner, ownerBookings, ownerListings } from '../../../../../lib/session'
import {
  BOOKING_WINDOWS,
  bookingFilterQuery,
  DEFAULT_FILTER,
  isFiltered,
  parseBookingFilter,
  type BookingFilter,
  type BookingWindow,
} from '../../../../../lib/booking-filters'
import { addDays, beirutDate, beirutDayLabel, beirutTime } from '../../../../../lib/beirut'
import { LINK, NOTICE_INFO, PRIMARY_BUTTON } from '../../../../../components/formStyles'
import { BookingActions } from '../../../../../components/BookingActions'

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
  const [{ docs, totalDocs, awaiting }, listings] = await Promise.all([
    ownerBookings(filter),
    ownerListings(),
  ])

  /**
   * Tonight, counted from what is already on the page.
   *
   * The upcoming list is sorted ascending, so today's bookings are its front.
   * Anything cancelled is excluded - a cancelled table is not a cover, and
   * counting it would overstate the evening to the person cooking for it.
   *
   * Only stated on the default view. On "past" or a status filter the docs are
   * not today's and the sentence would be a guess dressed as a fact.
   */
  const today = beirutDate()
  const tonight =
    filter.window === 'upcoming'
      ? docs.filter(
          (row) => beirutDate(new Date(row.start)) === today && row.status !== 'cancelled',
        )
      : []

  const covers = tonight.reduce((sum, row) => sum + (row.partySize ?? 0), 0)

  const summary = [
    tonight.length > 0 ? t('summaryTonight', { covers, bookings: tonight.length }) : '',
    awaiting > 0 ? t('summaryAwaiting', { count: awaiting }) : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      {/*
        The sentence the owner came for, before the controls they did not.

        Both halves are already in hand: `awaiting` is counted outside the filter
        for the reason below, and today's bookings are the front of an ascending
        upcoming list, so neither costs a query. On any other view the summary
        says nothing rather than guessing - "tonight" is not a fact a page
        showing last March can state.
      */}
      {summary ? <p className="text-ink-700 mt-6 text-sm leading-relaxed">{summary}</p> : null}

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
        <BookingList bookings={docs} locale={locale as Locale} showBusiness={listings.length > 1} />
      )}
    </>
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
      {/*
        Three windows, and they fit on a phone. Left as a wrapping row.
      */}
      <div className="flex flex-wrap gap-2">
        {BOOKING_WINDOWS.map((value) => (
          <Chip key={value} href={href({ window: value })} active={filter.window === value}>
            {windowLabel[value]}
          </Chip>
        ))}
      </div>

      {/*
        Seven statuses, which is where the phone layout fell apart.

        Wrapping put "Awaiting confirmation", "Confirmed", "Cancelled",
        "Completed" and "Missed" across four ragged lines at 375px, so the
        controls were taller than the bookings under them. This is the same
        scrolling rail the directory uses for its sections: one line tall at
        every width, rules above and below so it reads as a band rather than as
        loose buttons.

        `scrollbar-none` hides the bar, not the scrolling - touch, wheel and
        keyboard all still work. The row is what scrolls, never the document:
        that distinction is why the governorate filter on /directory wraps
        instead, having once dragged the whole page sideways to 539px.
      */}
      <div className="border-ink-100 scrollbar-none mt-4 flex gap-2 overflow-x-auto border-y py-3">
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
      <form
        action={`/${locale}/partner`}
        method="get"
        className="mt-4 flex flex-wrap items-center gap-2"
      >
        {filter.status !== 'all' ? (
          <input type="hidden" name="status" value={filter.status} />
        ) : null}
        {filter.window !== DEFAULT_FILTER.window ? (
          <input type="hidden" name="window" value={filter.window} />
        ) : null}

        <label className="sr-only" htmlFor="partner-search">
          {t('searchLabel')}
        </label>

        {/* One bordered box on a phone rather than a field and a button that
            wrap onto separate lines. Same shape as the search on /search. */}
        <div className="border-ink-100 focus-within:border-gold-500 flex min-w-0 flex-1 items-stretch border transition-colors">
          <input
            id="partner-search"
            name="q"
            type="search"
            defaultValue={filter.search}
            placeholder={t('searchPlaceholder')}
            className="text-ink-900 placeholder:text-ink-500 w-full min-w-0 bg-transparent px-3 py-2.5 text-sm outline-none"
          />
          <button
            type="submit"
            className="bg-cedar-900 text-surface-base hover:bg-gold-700 shrink-0 px-4 text-sm transition-colors"
          >
            {t('searchAction')}
          </button>
        </div>

        {isFiltered(filter) ? (
          <Link href="/partner" className={`${LINK} shrink-0 text-sm`}>
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
      /*
        `whitespace-nowrap` and a fixed height, for the same reason
        ui/FilterChip carries them: "Awaiting confirmation" and "Any status"
        broke over two lines inside the scrolling rail, so every chip in the row
        grew to 54px to match and the band came out ragged. The row already
        scrolls sideways - there is nothing to gain by letting a label wrap.
      */
      className={`inline-flex h-10 shrink-0 items-center whitespace-nowrap border px-4 text-sm transition ${
        active
          ? 'border-cedar-900 bg-cedar-900 text-surface-base'
          : 'border-ink-100 text-ink-700 hover:border-ink-300'
      }`}
    >
      {children}
    </Link>
  )
}

type BookingDoc = Awaited<ReturnType<typeof ownerBookings>>['docs'][number]

/**
 * The coloured edge down the left of a row, and the word beside it.
 *
 * Colour is never the only signal - the status is also written out - for the
 * reason ui/Tier gives about verified: a border a reader cannot distinguish is
 * not a status, it is decoration. `state.*` rather than brand colours, because
 * these are statuses and should stay green and gold if the brand stops being.
 */
const STATUS_EDGE: Record<string, string> = {
  pending: 'border-s-gold-700',
  confirmed: 'border-s-state-success',
  completed: 'border-s-state-success',
  cancelled: 'border-s-ink-100',
  /**
   * `no-show`, not `missed`. Both tables were keyed on the word the interface
   * prints rather than the value the database stores, so the one status worth
   * spotting from across a room fell through to the neutral fallback and drew
   * itself grey. The `satisfies` is what makes that a compile error rather than
   * a colour nobody notices is missing: it rejects a key that is not a real
   * status. It cannot require every status to be listed, since the fallback is
   * deliberate, so a new status still needs a colour adding by hand.
   */
  'no-show': 'border-s-state-danger',
} satisfies Partial<Record<BookingStatus, string>>

const STATUS_TEXT: Record<string, string> = {
  pending: 'text-gold-700',
  confirmed: 'text-state-success',
  completed: 'text-state-success',
  cancelled: 'text-ink-500',
  'no-show': 'text-state-danger',
} satisfies Partial<Record<BookingStatus, string>>

/**
 * The reservation book, grouped by the day it is worked.
 *
 * # Why the time is the biggest thing on the row
 *
 * The guest's name used to be. But nobody scans a service by name - a kitchen
 * scans it by clock, and decides a table from the time and the number of
 * covers. Those two now sit together in their own column, in mono so the digits
 * line up down the page, and everything else is the detail beside them.
 *
 * # Why it is grouped
 *
 * A flat list is right for four bookings and wrong for four hundred. A venue
 * thinks in services: tonight, then Saturday. The headings also give the page
 * somewhere to breathe when there are thirty rows.
 *
 * # Cancelled recedes rather than disappears
 *
 * It is still a fact about the evening - a table that was booked and is not
 * coming - so it stays readable and stops competing: struck time, muted, no
 * fill. Before this it had the same weight as a live booking, which is the
 * opposite of true.
 */
async function BookingList({
  bookings,
  locale,
  showBusiness,
}: {
  bookings: BookingDoc[]
  locale: Locale
  /** Only worth printing on a row when the account manages more than one. */
  showBusiness: boolean
}) {
  const status = await getTranslations('bookingStatus')
  const t = await getTranslations('partner')
  const booking = await getTranslations('booking')

  const today = beirutDate()
  const tomorrow = addDays(today, 1)

  /** Consecutive rows on the same calendar day, in the order they arrived. */
  const days: Array<{ key: string; label: string; rows: BookingDoc[] }> = []

  for (const row of bookings) {
    const key = beirutDate(new Date(row.start))
    const last = days[days.length - 1]

    if (last?.key === key) {
      last.rows.push(row)
      continue
    }

    const named = beirutDayLabel(new Date(row.start), locale)
    days.push({
      key,
      label:
        key === today
          ? `${t('today')} · ${named}`
          : key === tomorrow
            ? `${t('tomorrow')} · ${named}`
            : named,
      rows: [row],
    })
  }

  return (
    <div className="mt-6">
      {days.map((day) => (
        <section key={day.key} className="mt-8 first:mt-0">
          <h2 className="border-ink-100 text-ink-500 border-b pb-2 font-mono text-[11px] uppercase tracking-[0.14em]">
            {day.label}
          </h2>

          <ul>
            {day.rows.map((row) => {
              const business = row.business
              const name = typeof business === 'object' && business ? (business.name ?? '') : ''
              const cancelled = row.status === 'cancelled'

              /**
               * From `guest`, not from the populated relationship, which an owner
               * is not allowed to read. See ownerBookings. A booking whose
               * customer row has gone still renders, with the name missing.
               */
              const guestName = row.guest?.name || t('guestUnknown')

              return (
                <li
                  key={row.id}
                  className={`border-ink-100 flex gap-4 border-b border-s-[3px] py-4 ps-3 ${
                    STATUS_EDGE[row.status ?? ''] ?? 'border-s-ink-100'
                  } ${cancelled ? 'opacity-60' : ''}`}
                >
                  {/* The clock and the covers, together and first. `w-16` holds
                      the column steady whether the time is 09:00 or 20:00, so
                      the names beside it line up down the page. */}
                  <div className="w-16 shrink-0">
                    <p
                      className={`text-ink-900 font-mono text-lg tabular-nums ${
                        cancelled ? 'line-through' : ''
                      }`}
                    >
                      {beirutTime(new Date(row.start), locale)}
                    </p>
                    <p className="text-ink-500 mt-0.5 font-mono text-[11px]">
                      {t('people', { count: row.partySize })}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1">
                    {/*
                      The status, on a phone.

                      It sits in its own column on the right at `sm` and above.
                      At 375px that column is wide enough for "Awaiting
                      confirmation" and narrow enough to crush everything beside
                      it: the guest's name wrapped onto two lines, the reference
                      onto three, and a one-sentence note onto four. Moving it
                      above the name on small screens gives the detail column
                      the whole width back.
                    */}
                    <p
                      className={`mb-1 font-mono text-[10px] uppercase tracking-[0.12em] sm:hidden ${
                        STATUS_TEXT[row.status ?? ''] ?? 'text-ink-500'
                      }`}
                    >
                      {status(row.status as BookingStatus)}
                    </p>

                    <p className={`${cancelled ? 'text-ink-500' : 'text-ink-900 font-medium'}`}>
                      {guestName}
                    </p>

                    {/*
                      Who this person is to the venue, in one line under their
                      name.

                      A dashboard that says "Rania Haddad, two people, 20:00"
                      tells a restaurant nothing it did not already know from
                      the request. Whether she has eaten there nine times is the
                      difference between a table and the good table, and it is
                      the venue's own record of its own guest - see withGuests
                      for why it can never become a report on where else she
                      eats.

                      The no-show count is the other half and reads harsher, so
                      it is only printed when it is not zero and it counts
                      rather than judges. It is the honest answer to the one
                      question an owner has when a request comes in for a
                      Saturday they could sell twice over. Dropped for a
                      cancelled row, where nobody is deciding anything.
                    */}
                    {!cancelled && row.guest && (row.guest.visits > 0 || row.guest.missed > 0) ? (
                      <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                        {row.guest.visits > 0 ? (
                          <span className="text-ink-500">
                            {t('guestVisits', { count: row.guest.visits })}
                          </span>
                        ) : null}
                        {row.guest.missed > 0 ? (
                          <span className="text-state-danger">
                            {t('guestMissed', { count: row.guest.missed })}
                          </span>
                        ) : null}
                      </p>
                    ) : null}

                    {/*
                      The listing's name only when there is more than one to tell
                      apart. With a single listing it repeats the page title on
                      every row and costs a line on the narrowest screen.
                    */}
                    <p className="text-ink-500 mt-1 text-xs">
                      {showBusiness ? `${name} · ` : ''}
                      {booking('reference')}{' '}
                      <span className="select-all font-mono">{row.reference}</span>
                    </p>

                    {/* The one thing a venue needs when the evening changes.
                        Shown, not hidden behind a click: ringing a guest to move
                        a table by an hour is the ordinary case. Dropped for a
                        cancelled booking - there is nobody to ring. */}
                    {row.guest?.phone && !cancelled ? (
                      <p className="mt-1 text-xs">
                        {/* `dir="ltr"`, or bidi reorders the groups of a phone
                            number on the Arabic page: +961 3 411 208 renders as
                            208 411 3 961+, which is not a typographic nicety -
                            it is a number somebody would dial wrong. Same
                            reason OpeningHoursTable pins its times. */}
                        <a
                          href={`tel:${row.guest.phone}`}
                          dir="ltr"
                          className={`${LINK} inline-block`}
                        >
                          {row.guest.phone}
                        </a>
                      </p>
                    ) : null}

                    {/* What the customer asked us to pass on. The reason a
                        kitchen needs to read this before the evening.

                        `dir="auto"`: a guest writes this in whichever language
                        they booked in, so an English note on the Arabic page
                        would otherwise have its full stop thrown to the left. */}
                    {row.notes && !cancelled ? (
                      <p
                        dir="auto"
                        className="text-ink-700 border-ink-100 mt-3 border-s-2 ps-3 text-sm"
                      >
                        {row.notes}
                      </p>
                    ) : null}

                    {/* Inline, on the row that needs answering. This is the only
                        thing on the page that costs somebody something while it
                        waits, and it used to require finding a filter first. */}
                    <BookingActions
                      id={row.id}
                      status={row.status as BookingStatus}
                      ended={row.ended}
                    />
                  </div>

                  <p
                    className={`hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] sm:block ${
                      STATUS_TEXT[row.status ?? ''] ?? 'text-ink-500'
                    }`}
                  >
                    {status(row.status as BookingStatus)}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
