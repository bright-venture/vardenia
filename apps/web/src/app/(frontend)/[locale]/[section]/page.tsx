import { EnglishPageSchema } from '../../../../components/EnglishPageSchema'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { notFoundIfHidden, type HideablePage } from '../../../../lib/hidden-pages'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import {
  SECTION_PATHS,
  TAXONOMY,
  categoryTakesBookings,
  isBookableSubcategory,
  sectionForPath,
  type SiteSection,
  type SubCategory,
  isComingSoonCategory,
} from '@vardenia/core'
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from '@vardenia/i18n'
import { buildMetadata } from '../../../../lib/seo'
import { Link } from '../../../../i18n/routing'
import { ComingSoonNotice } from '../../../../components/ComingSoonNotice'
import {
  countByCity,
  countByGovernorate,
  countBySubcategory,
  findListings,
} from '../../../../lib/listings'
import { BYBLOS_GUIDE_PATH } from '../../../../components/journey/destinations'
import { PageHero } from '../../../../components/editorial/PageHero'
import { sectionName, sectionSummary } from '../../../../lib/labels'
import { sectionSeoCopy } from '../../../../lib/section-seo'
import { ListingGrid } from '../../../../components/ListingGrid'
import { SubcategoryTiles } from '../../../../components/SubcategoryTiles'
import { LINK } from '../../../../components/formStyles'
import {
  ListingFilters,
  anyFilterApplied,
  filterHref,
  parseFilterState,
  type RawFilterParams,
} from '../../../../components/ListingFilters'
import { Pagination } from '../../../../components/Pagination'
import { TripBar } from '../../../../components/TripBar'
import { tripVerdicts } from '../../../../lib/trip-availability'

/**
 * One of the seven sections: /stay, /eat-and-drink, /weddings and so on.
 *
 * # Why these exist at all
 *
 * The site used to reach categories only through `/directory?category=...`. That
 * worked, but it meant the navigation and the database spoke different
 * languages, and three categories that can be sold to today - weddings,
 * lifestyle and healthcare - had no place in the navigation at all. A wedding
 * venue could have been given a printed code pointing at a section that did not
 * exist. See packages/core/src/sections.
 *
 * # Why a dynamic segment at the top level
 *
 * `/stay` reads better than `/directory/stay` and is what would be printed in a
 * magazine. The cost is that this route sees every unmatched single-segment
 * path on the site, so an unknown one has to 404 explicitly - otherwise every
 * typo would render an empty listing page rather than a not-found. Static routes
 * take priority in Next, so `/account` and `/magazine` are never reached here.
 *
 * # Subcategories are filters
 *
 * All fifty-one of them, across one template. Hospitality alone has eight; if
 * each were a page this file would be a directory of near-identical files and
 * the design work would multiply by the same factor.
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
  params: Promise<{ locale: string; section: string }>
  searchParams: Promise<RawFilterParams & { page?: string; show?: string }>
}

/** Seven sections in two languages, all prerendered at build time. */
export function generateStaticParams() {
  return LOCALES.flatMap((locale) => SECTION_PATHS.map((section) => ({ locale, section })))
}

const nameFor = (section: SiteSection, locale: string) =>
  sectionName(section, isLocale(locale) ? locale : DEFAULT_LOCALE)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, section: path } = await params
  const section = sectionForPath(path)
  if (!section) return {}

  const resolvedLocale = isLocale(locale) ? locale : DEFAULT_LOCALE
  return buildMetadata({
    seo: undefined,
    ...sectionSeoCopy(section, resolvedLocale),
    path: `/${section.path}`,
    locale: resolvedLocale,
  })
}

export default async function SectionPage({ params, searchParams }: Props) {
  const { locale, section: path } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  // The 404 that stops this route swallowing every mistyped URL on the site.
  const section = sectionForPath(path)
  if (!section) notFound()
  // An admin can hide a section (Settings, Pages). This route has no
  // loading.tsx, for the reason magazine/articles/page.tsx gives: one would send
  // the 200 before this check could make it a 404. The results keep their own
  // skeleton, inside the page.
  await notFoundIfHidden(section.path as HideablePage)

  const t = await getTranslations('directory')
  // Weddings and Getting Around are not open yet (core COMING_SOON_CATEGORIES,
  // 25 November 2026): the heading stays, a Coming soon notice replaces the
  // listings, and the listings themselves are not public (access/index).
  const comingSoon = isComingSoonCategory(section.category)

  const englishDining = locale === 'en' && section.category === 'food-and-beverage'
  const inJbeil = englishDining && parseFilterState(await searchParams, []).city === 'jbeil'

  return (
    <main className="vd-category-page" data-section={section.path}>
      <EnglishPageSchema
        locale={locale}
        path={`/${section.path}`}
        name={nameFor(section, locale)}
        description={sectionSummary(section, locale)}
        type="CollectionPage"
      />
      <PageHero
        title={inJbeil ? 'Eat & Drink in Jbeil' : nameFor(section, locale)}
        intro={
          inJbeil
            ? 'Planning a meal around Byblos? This view covers the whole Jbeil district, from the old town to villages inland.'
            : sectionSummary(section, locale)
        }
        body={
          inJbeil
            ? 'Check the address before setting out from the harbour. A place listed in Jbeil may be outside walking distance of the souk.'
            : t(`sectionIntro.${section.path}` as 'sectionIntro.stay')
        }
        locale={locale}
        place={
          (
            {
              stay: 1,
              'eat-and-drink': 0,
              experiences: 3,
              weddings: 5,
              lifestyle: 2,
              'getting-around': 4,
            } as Record<string, number>
          )[path] ?? 0
        }
      >
        {comingSoon ? null : (
          <a className="vd-button" href="#section-results">
            {t('chooseType')} <span aria-hidden>↓</span>
          </a>
        )}
      </PageHero>
      {comingSoon ? (
        <ComingSoonNotice body="sectionBody" />
      ) : (
        <div className="vd-category-results" id="section-results">
          {/* Same arrangement as the directory: `searchParams` is what makes a
            route dynamic, so it is handed over unawaited and only this boundary
            blocks on it. The heading above ships from the static build. */}
          <Suspense fallback={<SectionSkeleton />}>
            <SectionResults locale={locale} section={section} searchParams={searchParams} />
          </Suspense>
        </div>
      )}
    </main>
  )
}

async function SectionResults({
  locale,
  section,
  searchParams,
}: {
  locale: Locale
  section: SiteSection
  searchParams: Props['searchParams']
}) {
  const { page, ...raw } = await searchParams
  const t = await getTranslations('directory')

  // Widened from the literal type, because the tiles and the check below both
  // ask about `retired`, which TAXONOMY's `as const` only declares on the
  // entries that actually carry it.
  const children: readonly SubCategory[] =
    TAXONOMY.find((entry) => entry.slug === section.category)?.children ?? []

  // Validated in one shared place, so this page and the directory reject the
  // same things. See parseFilterState.
  const state = parseFilterState(raw, children)

  /**
   * No separate first screen of kinds of place any more (18 November 2026):
   * the section opens on its listings, with the kinds as filter tabs above
   * them (SubcategoryTiles). An old `?show=all` link still lands here.
   */

  /**
   * Counts feed the filter chips, and the grid needs its page. In parallel, so a
   * second Frankfurt round trip does not sit in front of the render. The tile
   * counts are only fetched when the tiles are actually being drawn.
   */
  const [counts, result, subcategoryCounts, cityCounts] = await Promise.all([
    countByGovernorate({ category: section.category, subcategory: state.subcategory }),
    findListings({ locale, category: section.category, ...state, page: Number(page) || 1 }),
    countBySubcategory({ category: section.category }),
    countByCity({ category: section.category, subcategory: state.subcategory }),
  ])

  const englishDining = locale === 'en' && section.category === 'food-and-beverage'
  const jbeilOnly =
    englishDining &&
    state.city === 'jbeil' &&
    !anyFilterApplied({ ...state, governorate: undefined, city: undefined })
  // These tab totals are nationwide, so omit them when a dining search is narrowed.
  const omitDiningTotals = englishDining && anyFilterApplied({ ...state, subcategory: undefined })
  // Use the published entry's own description, and only feature it when it is in these results.
  const diningExample =
    englishDining && !anyFilterApplied(state) && !state.trip && result?.page === 1
      ? result.docs.find((place) => place.slug === 'em-sherif' && place.name && place.tagline)
      : undefined
  const base = `/${section.path}`

  /**
   * Page links carry every filter with them. Reused from the same builder as the
   * chips, so page two of a filtered view cannot quietly drop the filters and
   * show a different set of listings under the same heading.
   */
  const pageHref = (n: number) => {
    const href = filterHref(base, state, {})
    return href.includes('?') ? `${href}&page=${n}` : `${href}?page=${n}`
  }

  const total = result?.totalDocs ?? 0

  // See the directory: only with plans set, and only for bookable places.
  const verdicts = await tripVerdicts(result?.docs ?? [], state.trip ?? null)

  // Listings in the whole section, for the All tab.
  const sectionTotal = subcategoryCounts
    ? Object.values(subcategoryCounts).reduce((sum, n) => sum + n, 0)
    : null

  const emptyWeddings =
    locale === 'en' &&
    section.path === 'weddings' &&
    !anyFilterApplied(state) &&
    result?.totalDocs === 0

  return (
    <>
      {diningExample && (
        <p className="mb-5 text-base">
          <Link className={LINK} href={`/directory/${diningExample.slug}`}>
            {diningExample.name}
          </Link>
          {' · '}
          {diningExample.tagline}
        </p>
      )}
      {emptyWeddings && (
        <section className="vd-weddings-empty" aria-labelledby="wedding-planners-title">
          <h2 id="wedding-planners-title">Wedding planners</h2>
          <p>No wedding planners are listed yet.</p>
          <Link className="vd-text-link" href="/directory">
            Explore the directory <span aria-hidden>↗</span>
          </Link>
        </section>
      )}
      <div className={emptyWeddings ? 'vd-weddings-standard' : 'contents'}>
        {/* The kinds of place, as filter tabs above the listings. */}
        <SubcategoryTiles
          base={base}
          state={state}
          subcategories={children}
          counts={omitDiningTotals ? null : subcategoryCounts}
          total={omitDiningTotals ? null : sectionTotal}
          locale={locale}
        />

        {/*
          The result count. It used to share this row with a List/Map toggle; the
          map was removed before launch because no listing carries coordinates.
        */}
        <div className="mt-3">
          {/* Hidden at zero: the empty state below says the same sentence. */}
          {total > 0 ? (
            <p className="text-ink-500 font-mono text-sm tabular-nums">
              {t('resultCount', { count: total })}
            </p>
          ) : null}
        </div>

        {/* Only where something here can be booked. Lifestyle, and Cafes, Pools,
            Nightlife, Festivals and Historic Sites, are listed and advertised but
            never booked, so asking for a date there promises an answer nobody can
            give. See bookable in core/taxonomy. */}
        {(
          state.subcategory
            ? isBookableSubcategory(state.subcategory)
            : categoryTakesBookings(section.category)
        ) ? (
          <TripBar base={base} state={state} locale={locale} section={section.path} />
        ) : null}

        <ListingFilters
          base={base}
          state={state}
          locale={locale}
          counts={counts}
          cityCounts={cityCounts}
        />

        <ListingGrid
          listings={result?.docs ?? []}
          locale={locale}
          // A section page is a results page: the grid starts near the top.
          eager
          trip={state.trip}
          verdicts={verdicts}
          empty={
            jbeilOnly && total === 0
              ? 'No Eat & Drink listings in Jbeil yet'
              : t('resultCount', { count: 0 })
          }
          // Says which way out exists, rather than restating the problem. See
          // ui/EmptyState: the title is what happened, the body is what to do.
          emptyBody={
            jbeilOnly && total === 0
              ? 'Browse the Lebanon directory for places to eat and drink in other regions.'
              : anyFilterApplied(state)
                ? t('emptyFiltered')
                : t('emptySection')
          }
          emptyAction={
            anyFilterApplied(state) ? (
              <Link
                href={filterHref(base, { amenities: [], trip: state.trip }, {})}
                prefetch={false}
                rel="nofollow"
                className={LINK}
              >
                {jbeilOnly ? 'Browse Eat & Drink across Lebanon' : t('clearFilters')}
              </Link>
            ) : null
          }
        />

        <Pagination
          className="mt-12"
          page={result?.page ?? 1}
          totalPages={result?.totalPages ?? 1}
          href={pageHref}
        />
      </div>
    </>
  )
}

/** Roughly the shape of the real grid, so the page does not jump. */
function SectionSkeleton() {
  return (
    <div aria-hidden className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <div key={n} className="bg-surface-sunken h-64 animate-pulse" />
      ))}
    </div>
  )
}
