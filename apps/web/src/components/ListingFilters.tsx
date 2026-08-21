import {
  AMENITIES,
  AMENITY_SLUGS,
  GOVERNORATES,
  PRICE_RANGES,
  PRICE_SLUGS,
  type Labelled,
} from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import { governorateLabel, districtLabel, subcategoryLabel, amenityLabel } from '../lib/labels'
import { Link } from '../i18n/routing'
import { FilterChip } from './FilterChip'

/**
 * Every way to narrow a list of places.
 *
 * # Two kinds of filter, shown differently
 *
 * What a place *is* - its kind, and where it is - is what almost everybody
 * narrows by, so those rows are always open. Price and amenities are a smaller
 * audience asking a sharper question, and sixteen more chips on top of the
 * others turns a page with two listings on it into a wall of controls. They live
 * behind a disclosure, which is a `<details>` element and therefore works with
 * no JavaScript at all.
 *
 * The exception proves the rule: somebody filtering for wheelchair access is not
 * browsing, they are checking whether they can get in the door. That is why
 * accessibility is first in the amenity list rather than alphabetical.
 *
 * # Districts appear only once a governorate is chosen
 *
 * There are twenty-eight of them. Shown all at once they are noise, and most
 * would return nothing; shown under their governorate they are the natural next
 * question after "Mount Lebanon".
 *
 * # Every filter is a link
 *
 * No form, no client state. Each chip is an href to the same page with one facet
 * changed, so every combination is a real URL that can be shared, bookmarked,
 * indexed and printed. The same reasoning as the rest of the directory.
 */

export interface FilterState {
  subcategory?: string
  governorate?: string
  district?: string
  priceRange?: string
  amenities: string[]
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
const displayAmenities = [
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
}) {
  const ar = locale === 'ar'
  const href = (change: Partial<FilterState>) => filterHref(base, state, change)

  const districts =
    GOVERNORATES.find((g) => g.slug === state.governorate)?.districts ?? ([] as Labelled[])

  const narrowed =
    Boolean(state.priceRange) || state.amenities.length > 0 || Boolean(state.district)

  return (
    <div className="mt-8 flex flex-col gap-3">
      {subcategories.length > 0 ? (
        <Row label={ar ? 'النوع' : 'Kind'}>
          <FilterChip href={href({ subcategory: undefined })} active={!state.subcategory}>
            {ar ? 'الكل' : 'All'}
          </FilterChip>
          {subcategories.map((child) => (
            <FilterChip
              key={child.slug}
              href={href({ subcategory: child.slug })}
              active={state.subcategory === child.slug}
            >
              {subcategoryLabel(child.slug, locale)}
            </FilterChip>
          ))}
        </Row>
      ) : null}

      <Row label={ar ? 'المحافظة' : 'Governorate'}>
        <FilterChip href={href({ governorate: undefined })} active={!state.governorate}>
          {ar ? 'كل لبنان' : 'All of Lebanon'}
        </FilterChip>
        {GOVERNORATES.map((g) => (
          <FilterChip
            key={g.slug}
            href={href({ governorate: g.slug })}
            active={state.governorate === g.slug}
          >
            {governorateLabel(g.slug, locale)}
          </FilterChip>
        ))}
      </Row>

      {districts.length > 1 ? (
        <Row label={ar ? 'القضاء' : 'District'}>
          <FilterChip href={href({ district: undefined })} active={!state.district}>
            {ar ? 'كل الأقضية' : 'Anywhere in it'}
          </FilterChip>
          {districts.map((d) => (
            <FilterChip
              key={d.slug}
              href={href({ district: d.slug })}
              active={state.district === d.slug}
            >
              {districtLabel(d.slug, locale)}
            </FilterChip>
          ))}
        </Row>
      ) : null}

      <details open={narrowed} className="mt-1">
        <summary className="text-ink-500 hover:text-ink-900 cursor-pointer text-sm">
          {ar ? 'المزيد من الفلاتر' : 'Price and features'}
        </summary>

        <div className="mt-4 flex flex-col gap-3">
          <Row label={ar ? 'السعر' : 'Price'}>
            <FilterChip href={href({ priceRange: undefined })} active={!state.priceRange}>
              {ar ? 'أي سعر' : 'Any price'}
            </FilterChip>
            {PRICE_RANGES.map((p) => (
              <FilterChip
                key={p.slug}
                href={href({ priceRange: p.slug })}
                active={state.priceRange === p.slug}
              >
                <span className="font-medium">{p.marks}</span>
                <span className="text-xs"> {ar ? p.ar : p.en}</span>
              </FilterChip>
            ))}
          </Row>

          <Row label={ar ? 'المرافق' : 'Features'}>
            {displayAmenities.map((a) => (
              <FilterChip
                key={a.slug}
                href={href({ amenities: toggled(state.amenities, a.slug) })}
                active={state.amenities.includes(a.slug)}
              >
                {amenityLabel(a.slug, locale)}
              </FilterChip>
            ))}
          </Row>
        </div>
      </details>

      {/* One link back to the unfiltered section. With five facets it is
          otherwise several clicks to undo, and a reader who has narrowed to
          nothing needs a way out that is not the back button. */}
      {state.subcategory || state.governorate || narrowed ? (
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
