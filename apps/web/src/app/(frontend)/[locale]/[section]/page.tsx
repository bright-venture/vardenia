import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import {
  SECTION_PATHS,
  TAXONOMY,
  sectionForPath,
  type SiteSection,
  type SubCategory,
} from '@vardenia/core'
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from '@vardenia/i18n'
import { alternatesFor } from '../../../../lib/seo'
import { Link } from '../../../../i18n/routing'
import { countByGovernorate, countBySubcategory, findListings } from '../../../../lib/listings'
import { sectionName } from '../../../../lib/labels'
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
import { pageWindow } from '../directory/page'

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

export const revalidate = 3600

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

  return {
    title: nameFor(section, locale),
    /**
     * Built from `section.path`, not from the `path` off the URL. They are equal
     * here because `sectionForPath` matches exactly, but the canonical URL of a
     * page should come from our own table rather than from the request - that is
     * the habit that stops a future looser lookup putting request text into a
     * tag whose whole job is to be authoritative.
     */
    alternates: alternatesFor(`/${section.path}`, isLocale(locale) ? locale : DEFAULT_LOCALE),
  }
}

export default async function SectionPage({ params, searchParams }: Props) {
  const { locale, section: path } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  // The 404 that stops this route swallowing every mistyped URL on the site.
  const section = sectionForPath(path)
  if (!section) notFound()

  const t = await getTranslations('directory')

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <header>
        <p className="text-gold-700 text-xs uppercase tracking-[0.2em]">{t('discoverLebanon')}</p>
        <h1 className="font-display text-ink-900 mt-3 text-4xl md:text-5xl">
          {nameFor(section, locale)}
        </h1>
      </header>

      {/* Same arrangement as the directory: `searchParams` is what makes a route
          dynamic, so it is handed over unawaited and only this boundary blocks
          on it. The heading above ships from the static build. */}
      <Suspense fallback={<SectionSkeleton />}>
        <SectionResults locale={locale} section={section} searchParams={searchParams} />
      </Suspense>
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
  const { page, show, ...raw } = await searchParams
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
   * The section opens on a choice of subcategory rather than on listings.
   *
   * Only when nothing has been narrowed yet: once a reader has picked a kind of
   * place, or a region, or anything else, they have answered the question the
   * tiles exist to ask and the listings are what they want. `?show=all` is the
   * explicit way past them - see SubcategoryTiles.
   */
  const choosing = show !== 'all' && !anyFilterApplied(state)

  /**
   * Counts feed the filter chips, and the grid needs its page. In parallel, so a
   * second Frankfurt round trip does not sit in front of the render. The tile
   * counts are only fetched when the tiles are actually being drawn.
   */
  const [counts, result, subcategoryCounts] = await Promise.all([
    countByGovernorate({ locale, category: section.category, subcategory: state.subcategory }),
    findListings({ locale, category: section.category, ...state, page: Number(page) || 1 }),
    choosing
      ? countBySubcategory({ locale, category: section.category })
      : Promise.resolve<Record<string, number>>({}),
  ])

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

  /**
   * The tiles answer for themselves whether there is a choice worth offering -
   * fewer than two subcategories on the section and they render nothing. Asking
   * here as well keeps the page from hiding its listings behind a row that is
   * about to be empty.
   */
  const tiles = choosing ? (
    <SubcategoryTiles
      base={base}
      subcategories={children}
      counts={subcategoryCounts}
      locale={locale}
    />
  ) : null

  /**
   * Mirrors what SubcategoryTiles decides, because a disagreement between the
   * two would render a page with neither tiles nor listings on it.
   *
   * It does not count non-empty subcategories. The row lists every kind of
   * place in the section and marks the empty ones with a nought, so the
   * question is only whether the section has a taxonomy worth showing at all.
   */
  const offeringChoice = choosing && children.filter((sub) => !sub.retired).length > 1

  /**
   * The choice, and nothing else on the page.
   *
   * The filter bar used to sit under the tiles. It asked the second question
   * while the first was still open, and it asked it in a different shape - a
   * row of regions and a Filters button below a row of kinds of place, with no
   * results for either of them to act on. Filtering comes after a choice, so
   * the bar appears on the listings view and not here.
   *
   * A section with nothing in it anywhere gets the row and nothing else, not
   * even the empty state. It used to fall straight through to "No places
   * found", which is how Weddings, Lifestyle, Health and Getting Around came
   * to show no kinds of place at all - the four sections where a reader most
   * needs to be told what will eventually be there. A row of noughts already
   * says there is nothing here, and says it about each kind of place rather
   * than about the section, so a box underneath repeating it in a sentence was
   * the same fact twice.
   */
  if (offeringChoice) {
    return tiles
  }

  return (
    <>
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

      <ListingFilters base={base} state={state} locale={locale} counts={counts} />

      <ListingGrid
        listings={result?.docs ?? []}
        locale={locale}
        // A section page is a results page: the grid starts near the top.
        eager
        empty={t('resultCount', { count: 0 })}
        // Says which way out exists, rather than restating the problem. See
        // ui/EmptyState: the title is what happened, the body is what to do.
        emptyBody={anyFilterApplied(state) ? t('emptyFiltered') : t('emptySection')}
        emptyAction={
          anyFilterApplied(state) ? (
            <Link href={base} className={LINK}>
              {t('clearFilters')}
            </Link>
          ) : null
        }
      />

      {(result?.totalPages ?? 0) > 1 ? (
        <nav className="mt-12 flex justify-center gap-3 text-sm" aria-label="Pagination">
          {pageWindow(result?.page ?? 1, result?.totalPages ?? 1).map((n, i) =>
            n === 'gap' ? (
              <span key={`gap-${i}`} aria-hidden className="text-ink-500 px-1 py-1">
                &hellip;
              </span>
            ) : (
              <Link
                key={n}
                href={pageHref(n)}
                aria-current={n === result?.page ? 'page' : undefined}
                className={
                  n === result?.page
                    ? 'bg-cedar-900 text-surface-base px-3 py-1 tabular-nums'
                    : 'border-ink-100 text-ink-700 hover:border-ink-300 border px-3 py-1 tabular-nums'
                }
              >
                {n}
              </Link>
            ),
          )}
        </nav>
      ) : null}
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
