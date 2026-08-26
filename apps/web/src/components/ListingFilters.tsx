import { AMENITIES, AMENITY_SLUGS, GOVERNORATES, PRICE_RANGES, PRICE_SLUGS } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import { governorateLabel, districtLabel, subcategoryLabel, amenityLabel } from '../lib/labels'
import { Link } from '../i18n/routing'
import { FilterChip } from './FilterChip'
import { FilterSheet } from './FilterSheet'

/**
 * Every way to narrow a list of places.
 *
 * # One row, a button, and a list of what is applied
 *
 * There are twenty-nine filters across five facets. Laid out as rows of chips
 * they wrapped to four lines on a laptop and six on a phone, which pushed the
 * listings off the screen on the one page whose whole job is to show listings.
 *
 * So there are three things here now:
 *
 * 1. Region, as chips for the places that actually have listings. Eight chips
 *    of which six read "0" is a row of dead ends, and it overflowed the bar;
 *    the full list, with the same counts, is the first group in the sheet.
 * 2. A Filters button carrying a count, which opens the sheet holding the other
 *    four facets. See FilterSheet.
 * 3. The applied filters, as chips that remove themselves.
 *
 * The third is not decoration. Once four facets live behind a button, a reader
 * can no longer see what is narrowing their results by looking at the page, and
 * "why are there only two hotels" stops being answerable without opening the
 * modal. Each one is a link, so removing a filter is a tap rather than a round
 * trip through the sheet.
 *
 * # Every applied filter is still a URL
 *
 * The sheet holds pending state while it is open and navigates once, on apply.
 * Nothing is kept in React that outlives it. Every combination is still a real
 * URL that can be shared, bookmarked, indexed and printed beside a QR code,
 * which is the constraint the whole directory is built around.
 *
 * The chips outside the sheet are plain links and keep working with no
 * JavaScript; the sheet does not, which is a degradation rather than a break.
 *
 * # Districts appear only once a governorate is chosen
 *
 * There are twenty-eight of them. Shown all at once they are noise, and most
 * would return nothing; shown under their governorate they are the natural next
 * question after "Mount Lebanon".
 *
 * # Wheelchair access is first, not alphabetical
 *
 * Somebody filtering for step-free access is not browsing sixteen options. It
 * is the only one that matters to them and it should not be seventh.
 */

export interface FilterState {
  subcategory?: string
  governorate?: string
  district?: string
  priceRange?: string
  amenities: string[]
}

/**
 * Whether anything is narrowing the list at all.
 *
 * Exported because the pages need it to decide what an empty result means. With
 * a filter applied, an empty page is something the reader can undo; with none,
 * it is a gap in the directory and offering "clear filters" would be nonsense.
 */
export function anyFilterApplied(state: FilterState): boolean {
  return (
    Boolean(state.subcategory) ||
    Boolean(state.governorate) ||
    Boolean(state.district) ||
    Boolean(state.priceRange) ||
    state.amenities.length > 0
  )
}

/**
 * The href for the same view with one facet changed.
 *
 * Built in a fixed order rather than by mutating what arrived, so two routes to
 * the same view produce the same string. Different orderings would be different
 * cache entries, and to a search engine two pages with identical content.
 */
export function filterHref(base: string, state: FilterState, change: Partial<FilterState>): string {
  const next = { ...state, ...change }

  // Choosing a different governorate cannot keep the old district: it belongs to
  // somewhere else, and the pair would return nothing while looking deliberate.
  if ('governorate' in change && change.governorate !== state.governorate) {
    next.district = undefined
  }

  const params = new URLSearchParams()
  if (next.subcategory) params.set('filter', next.subcategory)
  if (next.governorate) params.set('where', next.governorate)
  if (next.district) params.set('district', next.district)
  if (next.priceRange) params.set('price', next.priceRange)
  if (next.amenities.length > 0) params.set('has', [...next.amenities].sort().join(','))

  /**
   * `toString` escapes the comma to `%2C`. It is correct and it is ugly, and
   * these URLs are meant to be read, shared and occasionally printed next to a
   * QR code. A comma is a legal sub-delimiter in a query string, so it is put
   * back - the escaping buys nothing here and costs legibility.
   */
  const query = params.toString().replace(/%2C/g, ',')
  return query ? `${base}?${query}` : base
}

/** The query string as it arrives, before anything has been checked. */
export interface RawFilterParams {
  filter?: string
  where?: string
  district?: string
  price?: string
  has?: string
}

/**
 * The query string, reduced to what is actually recognised.
 *
 * Shared by the section pages and the directory so both reject the same things.
 * Anything unrecognised is dropped rather than passed to the database, for two
 * reasons - and the second is the one that bites:
 *
 * - a value that cannot match renders an empty page that looks like a real
 *   answer, so `/stay?filter=photographers` would read as "we have no hotels";
 * - every crafted value would otherwise be its own cache key, which is a cheap
 *   way for anybody to fill the cache with entries nobody will ask for twice.
 *
 * A district is only kept if it belongs to the chosen governorate, so the pair
 * can never contradict itself.
 */
export function parseFilterState(
  raw: RawFilterParams,
  subcategories: readonly { slug: string }[],
): FilterState {
  const governorate = GOVERNORATES.some((g) => g.slug === raw.where) ? raw.where : undefined
  const districts = GOVERNORATES.find((g) => g.slug === governorate)?.districts ?? []

  return {
    subcategory: subcategories.some((c) => c.slug === raw.filter) ? raw.filter : undefined,
    governorate,
    district: districts.some((d) => d.slug === raw.district) ? raw.district : undefined,
    priceRange: PRICE_SLUGS.includes(raw.price ?? '') ? raw.price : undefined,
    amenities: (raw.has ?? '')
      .split(',')
      .filter((slug) => AMENITY_SLUGS.includes(slug))
      .sort(),
  }
}

/** Adding an amenity if it is off, removing it if it is on. */
const toggled = (list: string[], slug: string) =>
  list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]

/**
 * Wheelchair access first, then the rest in their stored order.
 *
 * Sorted here rather than in the shared list, because that list defines a
 * Postgres enum and reordering it rewrites the type on four tables for what is
 * purely a display decision. Somebody filtering for step-free access is not
 * browsing sixteen options - it is the only one that matters to them, and it
 * should not be seventh.
 */
const FIRST = 'accessible'
export const displayAmenities = [
  ...AMENITIES.filter((a) => a.slug === FIRST),
  ...AMENITIES.filter((a) => a.slug !== FIRST),
]

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label={label}>
      {children}
    </nav>
  )
}

export function ListingFilters({
  base,
  state,
  subcategories,
  locale,
  counts,
}: {
  base: string
  state: FilterState
  /**
   * The children of this section's category, or empty on the directory.
   *
   * `/directory` is every category at once, so there is no subcategory row that
   * would mean anything - "boutique hotels" and "florists" are not alternatives
   * on one list. The row is dropped rather than rendered with a lone "All" chip
   * standing for nothing.
   */
  subcategories: readonly { slug: string }[]
  locale: Locale
  /**
   * Listings per governorate in this section, or undefined if not computed.
   *
   * Optional so a caller that has no cheap way to produce them renders the row
   * exactly as before rather than showing eight zeroes. See
   * lib/listings.countByGovernorate for what the numbers mean.
   */
  counts?: Record<string, number>
}) {
  const ar = locale === 'ar'
  const href = (change: Partial<FilterState>) => filterHref(base, state, change)

  /**
   * Which regions get a chip in the bar.
   *
   * Not all eight. Eight chips of which six read "0" is a row of dead ends that
   * happened to overflow the page, and widening them with counts is what pushed
   * the Filters button off the right edge. Showing the regions that have
   * something in them is both shorter and more useful - it is the difference
   * between a menu and a list of everywhere in Lebanon.
   *
   * The one currently chosen is always kept even at zero, or selecting an empty
   * region would make its own chip disappear and the bar would look like it had
   * ignored the tap.
   *
   * Capped so a full directory cannot overflow the row again. Canonical order
   * rather than by size, so a region does not move because a listing was
   * published somewhere else.
   *
   * Everything omitted is in the sheet's Region group, complete and with the
   * same counts. Nothing is unreachable, and every governorate URL still
   * resolves whether or not it has a chip.
   */
  const INLINE_REGIONS = 5
  const shown = counts
    ? GOVERNORATES.filter((g) => (counts[g.slug] ?? 0) > 0 || state.governorate === g.slug).slice(
        0,
        INLINE_REGIONS,
      )
    : GOVERNORATES

  const narrowed =
    Boolean(state.priceRange) || state.amenities.length > 0 || Boolean(state.district)

  const anyFilter = Boolean(state.subcategory) || Boolean(state.governorate) || narrowed

  /*
   * `mb-8` matching the `mt-8` above it, so the bar is a band with air on both
   * sides rather than a strip glued to the top of the grid.
   *
   * It belongs here rather than on ListingGrid: the grid is also used on the
   * home page and in search results, where it follows a heading and already has
   * its own spacing. Putting the margin on the filters gives the gap to exactly
   * the two pages that need it.
   */
  return (
    <div className="mb-8 mt-8 flex flex-col gap-3">
      {/*
        The bar: the regions worth offering, and the sheet trigger beside them.

        Wrapping to four lines on a laptop was the original problem, and a
        sideways-scrolling row was the original answer to it. That row is what
        later dragged the whole page sideways - see the note below. Showing
        only the regions that have listings keeps it short enough to wrap
        harmlessly, which is a bound on the content rather than on the box.
      */}
      <div className="flex items-start gap-3">
        {/*
          Two changes here, and it took a control run to tell which mattered.

          The row used to be a `overflow-x-auto` scroller sitting in a `flex-1`
          box. A flex item defaults to `min-width: auto`, so that box would not
          shrink below its contents: instead of the row scrolling inside a
          fixed width, the box grew to the width of all nine chips and dragged
          the document sideways with it. The Filters button, pinned after it,
          went off the right edge - which is exactly the bug that was reported.

          Measured at 375px on the pre-fix markup: the page scrolled to 539px
          and the button sat at 434-539, entirely outside the viewport.

          So the internal scroller is gone and the row wraps, and `min-w-0`
          lets this box shrink. Removing either alone was not enough; the first
          control run kept the wrapping row and passed, which is what caught an
          earlier version of this comment being wrong about the cause.
        */}
        <div className="min-w-0 flex-1">
          <Row label={ar ? 'المحافظة' : 'Governorate'}>
            {/*
              "All of Lebanon" carries the total, so the row adds up: the sum of
              the regions shown plus those behind Filters is the number on the
              first chip. Without it the reader has parts and no whole.
            */}
            <FilterChip
              href={href({ governorate: undefined })}
              active={!state.governorate}
              count={counts ? Object.values(counts).reduce((n, c) => n + c, 0) : undefined}
            >
              {ar ? 'كل لبنان' : 'All of Lebanon'}
            </FilterChip>
            {shown.map((g) => (
              <FilterChip
                key={g.slug}
                href={href({ governorate: g.slug })}
                active={state.governorate === g.slug}
                // Absent counts render no number at all rather than a zero,
                // which would claim something untrue.
                count={counts?.[g.slug] ?? (counts ? 0 : undefined)}
              >
                {governorateLabel(g.slug, locale)}
              </FilterChip>
            ))}
          </Row>
        </div>

        {/* Region, kind, district, price and the sixteen amenities live in here. */}
        <FilterSheet
          base={base}
          state={state}
          subcategories={subcategories}
          locale={locale}
          counts={counts}
        />
      </div>

      {/*
        What is currently applied, as removable chips.

        Once four of the five facets live behind a button, a reader can no
        longer see what is narrowing their results by looking at the page - and
        "why are there only two hotels" becomes unanswerable without opening the
        sheet. These are links, so each one is a real URL and removing a filter
        is one tap rather than a round trip through the modal.
      */}
      {narrowed || state.subcategory ? (
        <Row label={ar ? 'الفلاتر المطبقة' : 'Applied filters'}>
          {state.subcategory ? (
            <FilterChip href={href({ subcategory: undefined })} active>
              {subcategoryLabel(state.subcategory, locale)}
              <Cross />
            </FilterChip>
          ) : null}

          {state.district ? (
            <FilterChip href={href({ district: undefined })} active>
              {districtLabel(state.district, locale)}
              <Cross />
            </FilterChip>
          ) : null}

          {state.priceRange ? (
            <FilterChip href={href({ priceRange: undefined })} active>
              {PRICE_RANGES.find((p) => p.slug === state.priceRange)?.marks ?? state.priceRange}
              <Cross />
            </FilterChip>
          ) : null}

          {state.amenities.map((slug) => (
            <FilterChip
              key={slug}
              href={href({ amenities: toggled(state.amenities, slug) })}
              active
            >
              {amenityLabel(slug, locale)}
              <Cross />
            </FilterChip>
          ))}
        </Row>
      ) : null}

      {/* One link back to the unfiltered section. With five facets it is
          otherwise several clicks to undo, and a reader who has narrowed to
          nothing needs a way out that is not the back button. */}
      {anyFilter ? (
        <p className="mt-1">
          {/* `Link` from i18n/routing, not a bare anchor.
              `localePrefix` is `as-needed`, so Arabic lives at /ar/stay while
              `base` is /stay - a raw href would have thrown an Arabic reader
              onto the English page, which is the one link on the row where
              that is least excusable. */}
          <Link
            href={base}
            className="text-gold-700 hover:text-ink-900 text-sm underline underline-offset-4"
          >
            {ar ? 'مسح الفلاتر' : 'Clear filters'}
          </Link>
        </p>
      ) : null}
    </div>
  )
}

/**
 * The small cross on an applied-filter chip.
 *
 * Decorative: the chip is already a link whose text names the filter, and
 * announcing "times" after it would add nothing. What it does is make the chip
 * read as removable rather than as a label.
 */
function Cross() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="ms-1.5 inline-block size-3 align-[-1px]"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
