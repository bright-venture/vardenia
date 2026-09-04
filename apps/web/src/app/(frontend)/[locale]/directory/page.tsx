import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SECTIONS } from '@vardenia/core'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@vardenia/i18n'
import { alternatesFor } from '../../../../lib/seo'
import { Link, getPathname } from '../../../../i18n/routing'
import { countByGovernorate, findListings, findListingsForMap } from '../../../../lib/listings'
import { placeLabel, priceLabel } from '../../../../lib/labels'
import { ListingGrid } from '../../../../components/ListingGrid'
import { DirectoryMap, type MapPin } from '../../../../components/DirectoryMap'
import { LINK } from '../../../../components/formStyles'
import { FilterChip } from '../../../../components/FilterChip'
import {
  ListingFilters,
  anyFilterApplied,
  filterHref,
  parseFilterState,
  type RawFilterParams,
} from '../../../../components/ListingFilters'

/**
 * The browsable directory.
 *
 * Filtering is done with plain links and query strings rather than client-side
 * state. That keeps every filtered view a real, shareable, indexable URL, which
 * matters for a product whose whole growth story is search and print.
 *
 * The query string is why this page cannot be prerendered whole: reading
 * `searchParams` makes a route dynamic. Awaiting it at the top made the entire
 * page dynamic, so the title and the chrome waited on a database round trip that
 * had nothing to do with them.
 *
 * So the results are isolated behind Suspense and the promise is passed down
 * unawaited. The shell ships immediately from the static build and the listings
 * stream in when they are ready.
 */

interface Props {
  params: Promise<{ locale: string }>
  searchParams: Promise<RawFilterParams & { category?: string; page?: string; view?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  return {
    title: locale === 'ar' ? 'الدليل' : 'Directory',
    description:
      locale === 'ar'
        ? 'فنادق ومطاعم وتجارب مختارة في لبنان.'
        : 'Curated hotels, restaurants and experiences across Lebanon.',
    alternates: alternatesFor('/directory', isLocale(locale) ? locale : DEFAULT_LOCALE),
  }
}

export default async function DirectoryPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      {/*
        The design puts the result count beside the title. It cannot go here:
        this shell is deliberately static and the count needs the query, so
        hoisting it would make the whole page wait on a database round trip for
        one number - the exact thing the Suspense boundary below exists to
        avoid. It stays above the grid, inside the boundary, where it already
        was.
      */}
      <header>
        <p className="text-gold-700 font-mono text-[11px] uppercase tracking-[0.2em]">
          {locale === 'ar' ? 'اكتشف لبنان' : 'Discover Lebanon'}
        </p>
        <h1 className="font-display text-ink-900 mt-3 text-5xl leading-none lg:text-7xl">
          {locale === 'ar' ? 'الدليل' : 'Directory'}
        </h1>
      </header>

      {/* `searchParams` is handed over unawaited so this boundary is the only
          thing that blocks on it. */}
      <Suspense fallback={<DirectorySkeleton />}>
        <DirectoryResults locale={locale} searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

/**
 * The part that actually needs the query string, and therefore the database.
 *
 * The category chips live here rather than in the shell because which one is
 * highlighted depends on the query string too. Rendering them statically would
 * mean showing every chip unselected for a moment and then correcting it.
 */
async function DirectoryResults({
  locale,
  searchParams,
}: {
  locale: Locale
  searchParams: Props['searchParams']
}) {
  /**
   * `?category=` is handled in middleware, not here.
   *
   * It predates the section pages and has to keep working, but redirecting from
   * this component sends a 200 and then corrects itself in the browser: this
   * runs inside the Suspense boundary, so the response has already started and
   * the status can no longer change. A crawler sees the shell of a page that no
   * longer exists. Middleware answers with a real 308 before any of this runs.
   */
  const { page, view, ...raw } = await searchParams
  const t = await getTranslations('directory')
  const ar = locale === 'ar'

  /**
   * No subcategory here, so an empty list is passed and that row is dropped.
   *
   * A subcategory only means something inside a category: "boutique hotels" and
   * "florists" are not alternatives on a list that holds both. Where, price and
   * features are the same question whatever the listing is, so they carry over
   * unchanged.
   */
  const state = parseFilterState(raw, [])

  /**
   * `?view=map` is the same directory, drawn as pins instead of cards.
   *
   * It is read here rather than in the shell for the same reason the chips are:
   * which view is showing depends on the query string, and deciding it in the
   * static shell would flash the list and then swap to the map.
   */
  const isMap = view === 'map'

  /**
   * The counts feed the filter chips in both views, so they are fetched either
   * way. Only the body's data source changes with the view, and the branch not
   * taken resolves to null without touching the database - the map never fetches
   * a grid page it will not show, and the list never fetches every coordinate.
   */
  const [counts, result, points] = await Promise.all([
    // No category here - /directory is every section at once, so the counts are
    // "listings in this governorate" across the whole directory.
    countByGovernorate({ locale }),
    isMap ? Promise.resolve(null) : findListings({ locale, ...state, page: Number(page) || 1 }),
    isMap ? findListingsForMap({ locale, ...state }) : Promise.resolve(null),
  ])

  const pageHref = (n: number) => {
    const href = filterHref('/directory', state, {})
    return href.includes('?') ? `${href}&page=${n}` : `${href}?page=${n}`
  }

  /**
   * The List/Map switch preserves every active filter: a filtered map is just the
   * filtered list's URL with `view=map` added. So the toggle never drops what the
   * reader narrowed to, and a filtered map is as shareable as a filtered list.
   */
  const listHref = filterHref('/directory', state, {})
  const mapHref = listHref.includes('?') ? `${listHref}&view=map` : `${listHref}?view=map`

  const total = isMap ? (points?.length ?? 0) : (result?.totalDocs ?? 0)

  return (
    <>
      {/*
        The result count and the view switch share a row: the count on the start
        edge, the List/Map toggle on the end edge. Both depend on the query, so
        both live here inside the boundary rather than in the static shell.
      */}
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          {/* Hidden at zero: the empty state below already says it. */}
          {total > 0 ? (
            <p className="text-ink-500 font-mono text-sm tabular-nums">
              {t('resultCount', { count: total })}
            </p>
          ) : null}
          {isMap ? (
            <p className="text-ink-500 mt-1 text-xs">
              {ar
                ? 'تظهر على الخريطة الأماكن ذات الموقع المحدد فقط.'
                : 'Only places with a pinned location appear on the map.'}
            </p>
          ) : null}
        </div>

        {/* Two views of one query. FilterChip carries the active state, so the
            current view reads the same as a selected filter does. */}
        <div className="flex shrink-0 gap-2" aria-label={ar ? 'طريقة العرض' : 'View'}>
          <FilterChip href={listHref} active={!isMap}>
            {ar ? 'قائمة' : 'List'}
          </FilterChip>
          <FilterChip href={mapHref} active={isMap}>
            {ar ? 'خريطة' : 'Map'}
          </FilterChip>
        </div>
      </div>

      {/*
        Navigation, not a filter: these go to the section pages, which is where
        the kind of place is chosen. Kept above the filters so the distinction is
        visible - one row changes the page, the rest narrow it.

        A rail rather than a wrapping row, per the design: seven sections plus
        "All" wrapped to three ragged lines on a phone and pushed the listings
        off the screen. Scrolling sideways keeps the whole set one line tall at
        every width, and the rules above and below make it read as a band rather
        than as loose buttons.
      */}
      <nav
        className="border-ink-100 scrollbar-none mt-10 flex gap-2 overflow-x-auto border-y py-4"
        aria-label="Browse by section"
      >
        <FilterChip href="/directory" active>
          {locale === 'ar' ? 'الكل' : 'All'}
        </FilterChip>
        {SECTIONS.map((section) => (
          <FilterChip key={section.path} href={`/${section.path}`} active={false}>
            {locale === 'ar' ? section.ar : section.en}
          </FilterChip>
        ))}
      </nav>

      <ListingFilters
        base="/directory"
        state={state}
        subcategories={[]}
        locale={locale}
        counts={counts}
      />

      {isMap ? (
        points && points.length > 0 ? (
          <DirectoryMap
            label={ar ? 'خريطة الدليل' : 'Directory map'}
            pins={points.map((p): MapPin => ({
              slug: p.slug,
              name: p.name,
              lat: p.lat,
              lng: p.lng,
              tier: p.tier,
              // Built here, not in the client: the routing helper is server-side,
              // and a function cannot be handed to a client component as a prop.
              href: getPathname({ locale, href: `/directory/${p.slug}` }),
              place: placeLabel(p.governorate, p.district, locale),
              price: priceLabel(p.priceRange) ?? '',
            }))}
          />
        ) : (
          // The same empty state the grid shows, reused so a map with no pins reads
          // identically to a list with no cards.
          <ListingGrid
            listings={[]}
            locale={locale}
            empty={t('resultCount', { count: 0 })}
            emptyBody={anyFilterApplied(state) ? t('emptyFiltered') : t('emptySection')}
            emptyAction={
              anyFilterApplied(state) ? (
                <Link href="/directory" className={LINK}>
                  {t('clearFilters')}
                </Link>
              ) : null
            }
          />
        )
      ) : (
        <>
          <ListingGrid
            listings={result?.docs ?? []}
            locale={locale}
            // The results are the page. The first card is the largest thing above
            // the fold, so its image is worth preloading. See ListingGrid.
            eager
            empty={t('resultCount', { count: 0 })}
            emptyBody={anyFilterApplied(state) ? t('emptyFiltered') : t('emptySection')}
            emptyAction={
              anyFilterApplied(state) ? (
                <Link href="/directory" className={LINK}>
                  {t('clearFilters')}
                </Link>
              ) : null
            }
          />

          {/*
            Square cells, navy for the current page, per the design. The windowing
            stays: the design draws every page number because its sample data has
            four, and 308 listings at 24 a page is thirteen - which on a phone is a
            second row of controls under the results. `pageWindow` keeps it to one.
          */}
          {(result?.totalPages ?? 0) > 1 ? (
            <nav className="mt-16 flex items-center justify-center gap-2" aria-label="Pagination">
              {pageWindow(result?.page ?? 1, result?.totalPages ?? 1).map((n, i) =>
                n === 'gap' ? (
                  <span key={`gap-${i}`} aria-hidden className="text-ink-500 px-1">
                    &hellip;
                  </span>
                ) : (
                  <Link
                    key={n}
                    href={pageHref(n)}
                    aria-current={n === result?.page ? 'page' : undefined}
                    className={
                      n === result?.page
                        ? 'bg-cedar-900 text-surface-base inline-flex h-10 w-10 items-center justify-center font-mono text-xs tabular-nums'
                        : 'text-ink-500 hover:bg-surface-raised hover:text-ink-900 inline-flex h-10 w-10 items-center justify-center font-mono text-xs tabular-nums transition-colors'
                    }
                  >
                    {n}
                  </Link>
                ),
              )}
            </nav>
          ) : null}
        </>
      )}
    </>
  )
}

/**
 * Placeholder while the listings load.
 *
 * Sized to roughly match the real grid so the page does not jump when the cards
 * arrive. `aria-hidden` because a screen reader should hear the results, not a
 * description of the wait.
 */
/**
 * The page numbers worth showing: the first, the last, and a few either side.
 *
 * This rendered every page. At 24 listings a page that is 42 links for a
 * thousand listings and 417 for ten thousand, in the HTML of every directory
 * view - a control whose usefulness is fixed while its cost grows with the
 * catalogue. Gaps are rendered as an ellipsis so the jump is legible rather
 * than looking like missing pages.
 */
export function pageWindow(current: number, total: number, span = 2): (number | 'gap')[] {
  if (total <= 1) return []

  const wanted = new Set<number>([1, total])
  for (let n = current - span; n <= current + span; n++) {
    if (n >= 1 && n <= total) wanted.add(n)
  }

  const pages = [...wanted].sort((a, b) => a - b)
  const out: (number | 'gap')[] = []

  pages.forEach((n, i) => {
    const previous = pages[i - 1]

    if (previous !== undefined) {
      const missing = n - previous - 1
      // An ellipsis standing in for one page takes the same room as the page
      // and tells the reader less. Only collapse a genuine run.
      if (missing === 1) out.push(previous + 1)
      else if (missing > 1) out.push('gap')
    }

    out.push(n)
  })

  return out
}

function DirectorySkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="bg-surface-sunken mt-3 h-4 w-32" />
      <div className="mt-8 flex flex-wrap gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="bg-surface-sunken h-11 w-28" />
        ))}
      </div>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bg-surface-sunken aspect-[4/3]" />
        ))}
      </div>
    </div>
  )
}
