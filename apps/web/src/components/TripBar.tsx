import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { getPathname, Link } from '../i18n/routing'
import { addDays, beirutDate } from '../lib/beirut'
import {
  TRIP_DEFAULT_PARTY,
  TRIP_DEFAULT_TIME,
  TRIP_MAX_DAYS_AHEAD,
  TRIP_MAX_PARTY,
} from '../lib/trip'
import { FilterChip } from './FilterChip'
import { filterHref, type FilterState } from './ListingFilters'
import { INPUT, LABEL, LINK, PRIMARY_BUTTON } from './formStyles'

/**
 * "Your plans": the day, the time or the nights, and how many are coming.
 *
 * Asked once, above the results, and then carried by every link on the page:
 * the filters, the page numbers and each card, which opens its listing with
 * the Book form already filled in. Places that take bookings online say on
 * their card whether they could take these plans. See lib/trip.
 *
 * # A plain GET form, like the rest of the directory
 *
 * No JavaScript. Submitting navigates to the same view with the plans in the
 * query string, so the result is a real address, and the filters already
 * applied travel along as hidden fields rather than being dropped.
 *
 * # Stays ask for nights, everything else for a time
 *
 * A hotel is booked from check-in for a number of nights; a table, a class or a
 * spa for a time. The Stay section asks the first; the others, and the whole
 * directory, ask the second. A stay seen from the directory is checked for one
 * night, which is also what its card says.
 *
 * # Book online sits here, not with the other filters
 *
 * It is the question this bar raises: most listings are contact-only, and a
 * guest who has just chosen a date wants the ones that can take it. Placed in
 * the filter row it also squeezed the region chips off a phone.
 */
export async function TripBar({
  base,
  state,
  locale,
  mode,
}: {
  base: string
  state: FilterState
  locale: Locale
  mode: 'nights' | 'sitting'
}) {
  const t = await getTranslations()
  const trip = state.trip ?? null
  const today = beirutDate()

  // The filters already applied, carried through the submit. Built by the same
  // function as every other link, so the names and order cannot drift.
  const withoutTrip: FilterState = { ...state, trip: null }
  const [, query = ''] = filterHref(base, withoutTrip, {}).split('?')
  const carried = [...new URLSearchParams(query)]

  return (
    <section
      aria-labelledby="trip-bar-title"
      className="border-ink-100 bg-surface-raised mt-8 border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="trip-bar-title"
          className="text-ink-900 font-mono text-[11px] uppercase tracking-[0.16em]"
        >
          {t('directory.plansTitle')}
        </h2>
        <p className="text-ink-500 text-xs">
          {trip ? t('directory.plansNote') : t('directory.plansHint')}
        </p>
      </div>

      <form
        action={getPathname({ href: base, locale })}
        method="get"
        className="mt-4 grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_6.5rem_auto]"
      >
        {carried.map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        <div>
          <label className={LABEL} htmlFor="trip-date">
            {t('directory.plansDate')}
          </label>
          <input
            id="trip-date"
            type="date"
            name="date"
            required
            min={today}
            max={addDays(today, TRIP_MAX_DAYS_AHEAD)}
            defaultValue={trip?.date ?? ''}
            className={`mt-1.5 ${INPUT}`}
          />
        </div>

        {mode === 'nights' ? (
          <div>
            <label className={LABEL} htmlFor="trip-nights">
              {t('directory.plansNights')}
            </label>
            <select
              id="trip-nights"
              name="nights"
              defaultValue={String(trip?.nights ?? 1)}
              className={`mt-1.5 ${INPUT}`}
            >
              {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {t('booking.nightCount', { count: n })}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className={LABEL} htmlFor="trip-time">
              {t('directory.plansTime')}
            </label>
            <input
              id="trip-time"
              type="time"
              name="time"
              defaultValue={trip?.time ?? TRIP_DEFAULT_TIME}
              className={`mt-1.5 ${INPUT}`}
            />
          </div>
        )}

        <div>
          <label className={LABEL} htmlFor="trip-party">
            {t('directory.plansGuests')}
          </label>
          <input
            id="trip-party"
            type="number"
            name="party"
            inputMode="numeric"
            min={1}
            max={TRIP_MAX_PARTY}
            defaultValue={trip?.party ?? TRIP_DEFAULT_PARTY}
            className={`mt-1.5 ${INPUT}`}
          />
        </div>

        <button type="submit" className={PRIMARY_BUTTON}>
          {t('directory.plansApply')}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <FilterChip
          href={filterHref(base, state, { bookable: !state.bookable })}
          active={Boolean(state.bookable)}
        >
          {t('directory.bookOnline')}
        </FilterChip>

        {trip ? (
          <Link href={filterHref(base, withoutTrip, {})} className={`${LINK} text-sm`}>
            {t('directory.plansClear')}
          </Link>
        ) : null}
      </div>
    </section>
  )
}
