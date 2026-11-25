import { publicPageCopy } from '../../../../lib/public-page-copy'
import { EnglishPageSchema } from '../../../../components/EnglishPageSchema'
import { Suspense } from 'react'
import { ResultsSkeleton } from '../../../../components/ResultsSkeleton'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { notFoundIfHidden } from '../../../../lib/hidden-pages'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SECTIONS } from '@vardenia/core'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@vardenia/i18n'
import { buildMetadata } from '../../../../lib/seo'
import { Link } from '../../../../i18n/routing'
import { countByDistrict, countByGovernorate, findListings } from '../../../../lib/listings'
import { sectionName } from '../../../../lib/labels'
import { ListingGrid } from '../../../../components/ListingGrid'
import { LINK } from '../../../../components/formStyles'
import { FilterChip } from '../../../../components/FilterChip'
import { Pagination } from '../../../../components/Pagination'
import { EditorialIntro } from '../../../../components/journey/EditorialIntro'
import { tripVerdicts } from '../../../../lib/trip-availability'
import { tripParams } from '../../../../lib/trip'
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

/**
 * Rendered per request, declared rather than inferred.
 *
 * Reading `searchParams` already makes this page dynamic, but Next decides that
 * at build time from what the render touched. If an admin has the page hidden
 * when the site is built, `notFoundIfHidden` stops the render before
 * `searchParams` is read, Next files the page as static, and unhiding it later
 * fails every request with DYNAMIC_SERVER_USAGE (a 500). That happened to
 * /magazine/articles on 16 November 2026. Saying so here makes the build's
 * answer the same whether the page was hidden or not.
 */
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
  searchParams: Promise<RawFilterParams & { category?: string; page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale })
  return buildMetadata({
    seo: undefined,
    title: locale === 'en' ? publicPageCopy['/directory'].title : t('directory.title'),
    description: locale === 'en' ? publicPageCopy['/directory'].description : t('directory.metaDescription'),
    path: '/directory',
    locale: isLocale(locale) ? locale : DEFAULT_LOCALE,
  })
}

export default async function DirectoryPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  // An admin can hide the directory (Settings, Pages); its listings stay up.
  await notFoundIfHidden('directory')
  setRequestLocale(locale)

  return (
    <main className="vd-directory mx-auto max-w-6xl px-6 py-16">
      <EnglishPageSchema locale={locale} path={'/directory'} name={publicPageCopy['/directory'].title} description={publicPageCopy['/directory'].description} type="CollectionPage" />
      {/*
        The design puts the result count beside the title. It cannot go here:
        this shell is deliberately static and the count needs the query, so
        hoisting it would make the whole page wait on a database round trip for
        one number - the exact thing the Suspense boundary below exists to
        avoid. It stays above the grid, inside the boundary, where it already
        was.
      */}
      <EditorialIntro locale={locale} />

      {/* `searchParams` is handed over unawaited so this boundary is the only
          thing that blocks on it. */}
      <Suspense fallback={<ResultsSkeleton />}>
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
  const { page, ...raw } = await searchParams
  const t = await getTranslations('directory')

  /**
   * No subcategory here, so an empty list is passed and that row is dropped.
   *
   * A subcategory only means something inside a category: "boutique hotels" and
   * "florists" are not alternatives on a list that holds both. Where, price and
   * features are the same question whatever the listing is, so they carry over
   * unchanged.
   */
  const state = parseFilterState(raw, [])

  const [counts, result, districtCounts] = await Promise.all([
    // No category here - /directory is every section at once, so the counts are
    // "listings in this governorate" across the whole directory.
    countByGovernorate({}),
    findListings({ locale, ...state, page: Number(page) || 1 }),
    countByDistrict({}),
  ])

  // Only with plans set, and only for the places on this page that take
  // bookings: two reads, never cached. See lib/trip-availability.
  const verdicts = await tripVerdicts(result?.docs ?? [], state.trip ?? null)

  // The plans ride along to the section pages too, so choosing Stay after
  // setting a date does not lose it.
  const tripSuffix = state.trip ? `?${new URLSearchParams(tripParams(state.trip))}` : ''

  const pageHref = (n: number) => {
    const href = filterHref('/directory', state, {})
    return href.includes('?') ? `${href}&page=${n}` : `${href}?page=${n}`
  }

  const total = result?.totalDocs ?? 0

  return (
    <>
      {/*
        The result count, on its own row above the filters. It used to share this
        row with a List/Map toggle; the map was removed before launch because no
        listing carries coordinates, so there was never anything to draw.
      */}
      <div className="vd-directory-count mt-3">
        {/* Hidden at zero: the empty state below already says it. */}
        {total > 0 ? (
          <p className="text-ink-500 font-mono text-sm tabular-nums">
            {t('resultCount', { count: total })}
          </p>
        ) : null}
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
        className="vd-directory-categories border-ink-100 scrollbar-none mt-10 flex gap-2 overflow-x-auto border-y py-4"
        aria-label={t('sections')}
      >
        <FilterChip href="/directory" active>
          {t('all')}
        </FilterChip>
        {SECTIONS.map((section) => (
          <FilterChip key={section.path} href={`/${section.path}${tripSuffix}`} active={false}>
            {sectionName(section, locale)}
          </FilterChip>
        ))}
      </nav>

      {/* No "When are you going?" on the whole directory (18 November 2026):
          what a date means differs per kind of place, so it is asked in each
          section (Stay asks for nights and rooms). */}

      <ListingFilters
        base="/directory"
        state={state}
        locale={locale}
        counts={counts}
        districtCounts={districtCounts}
        showBookable
      />

      <ListingGrid
        listings={result?.docs ?? []}
        locale={locale}
        // The results are the page. The first card is the largest thing above
        // the fold, so its image is worth preloading. See ListingGrid.
        eager
        trip={state.trip}
        verdicts={verdicts}
        empty={t('resultCount', { count: 0 })}
        emptyBody={anyFilterApplied(state) ? t('emptyFiltered') : t('emptySection')}
        emptyAction={
          anyFilterApplied(state) ? (
            <Link
              href={filterHref('/directory', { amenities: [], trip: state.trip }, {})}
              prefetch={false}
              rel="nofollow"
              className={LINK}
            >
              {t('clearFilters')}
            </Link>
          ) : null
        }
      />

      <Pagination page={result?.page ?? 1} totalPages={result?.totalPages ?? 1} href={pageHref} />
    </>
  )
}
