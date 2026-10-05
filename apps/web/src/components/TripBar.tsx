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

type Wording = {
  title: string
  date: 'date' | 'checkIn'
  time: 'time' | 'startTime' | 'pickupTime'
  party: 'guests' | 'people' | 'passengers'
  apply: 'findRooms' | 'findTable' | 'showFree'
}

/** By section path. `any` is the whole directory. */
const WORDING: Record<string, Wording> = {
  any: { title: 'any', date: 'date', time: 'time', party: 'people', apply: 'showFree' },
  stay: { title: 'stay', date: 'checkIn', time: 'time', party: 'guests', apply: 'findRooms' },
  'eat-and-drink': {
    title: 'eat',
    date: 'date',
    time: 'time',
    party: 'people',
    apply: 'findTable',
  },
  experiences: {
    title: 'experiences',
    date: 'date',
    time: 'startTime',
    party: 'people',
    apply: 'showFree',
  },
  weddings: { title: 'weddings', date: 'date', time: 'time', party: 'guests', apply: 'showFree' },
  lifestyle: { title: 'other', date: 'date', time: 'time', party: 'people', apply: 'showFree' },
  'getting-around': {
    title: 'transport',
    date: 'date',
    time: 'pickupTime',
    party: 'passengers',
    apply: 'showFree',
  },
}

/** One height for every control in the row, the native date picker included. */
const FIELD = `mt-1.5 h-11 py-0 ${INPUT}`

/**
 * The plans bar: the day, the time or the nights, and how many are coming.
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
 * # Worded for the section
 *
 * "Check dates" and "Date / Time / Guests" asked a hotel guest and someone
 * after a taxi the same thing, and read as a form rather than a question. Each
 * section now asks its own: check-in and nights with "Find rooms" for a stay, a
 * table for a restaurant, a pick-up time and passengers for getting around. See
 * WORDING below; the directory as a whole uses the general one.
 *
 * # "Online booking only" sits here, not with the other filters
 *
 * It is the question this bar raises: most listings are contact-only, and a
 * guest who has just chosen a date wants the ones that can take it. Placed in
 * the filter row it also squeezed the region chips off a phone.
 */
export async function TripBar({
  base,
  state,
  locale,
  section,
}: {
  base: string
  state: FilterState
  locale: Locale
  /** The section path, or null for the whole directory. Stay asks for nights. */
  section: string | null
}) {
  const t = await getTranslations()
  const trip = state.trip ?? null
  const today = beirutDate()
  const words = WORDING[section ?? 'any'] ?? WORDING.any!
  const nights = section === 'stay'

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
        <h2 id="trip-bar-title" className="font-display text-ink-900 text-xl">
          {t(`directory.trip.title.${words.title}`)}
        </h2>
        <p className="text-ink-500 text-xs">
          {trip ? t('directory.trip.note') : t('directory.trip.hint')}
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
            {t(`directory.trip.${words.date}`)}
          </label>
          <input
            id="trip-date"
            type="date"
            name="date"
            required
            min={today}
            max={addDays(today, TRIP_MAX_DAYS_AHEAD)}
            defaultValue={trip?.date ?? ''}
            className={FIELD}
          />
        </div>

        {nights ? (
          <div>
            <label className={LABEL} htmlFor="trip-nights">
              {t('directory.trip.nights')}
            </label>
            <select
              id="trip-nights"
              name="nights"
              defaultValue={String(trip?.nights ?? 1)}
              className={FIELD}
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
              {t(`directory.trip.${words.time}`)}
            </label>
            <input
              id="trip-time"
              type="time"
              name="time"
              defaultValue={trip?.time ?? TRIP_DEFAULT_TIME}
              className={FIELD}
            />
          </div>
        )}

        <div>
          <label className={LABEL} htmlFor="trip-party">
            {t(`directory.trip.${words.party}`)}
          </label>
          <input
            id="trip-party"
            type="number"
            name="party"
            inputMode="numeric"
            min={1}
            max={TRIP_MAX_PARTY}
            defaultValue={trip?.party ?? TRIP_DEFAULT_PARTY}
            className={FIELD}
          />
        </div>

        <button type="submit" className={`${PRIMARY_BUTTON} h-11 py-0`}>
          {t(`directory.trip.${words.apply}`)}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <FilterChip
          href={filterHref(base, state, { bookable: !state.bookable })}
          active={Boolean(state.bookable)}
        >
          {t('directory.trip.onlineOnly')}
        </FilterChip>

        {trip ? (
          <Link href={filterHref(base, withoutTrip, {})} className={`${LINK} text-sm`}>
            {t('directory.trip.clear')}
          </Link>
        ) : null}
      </div>
    </section>
  )
}
