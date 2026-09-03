import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SECTION_PATHS, TAXONOMY, sectionForPath, type SiteSection } from '@vardenia/core'
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from '@vardenia/i18n'
import { alternatesFor } from '../../../../lib/seo'
import { Link } from '../../../../i18n/routing'
import { countByGovernorate, findListings } from '../../../../lib/listings'
import { ListingGrid } from '../../../../components/ListingGrid'
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
  searchParams: Promise<RawFilterParams & { page?: string }>
}

/** Seven sections in two languages, all prerendered at build time. */
export function generateStaticParams() {
  return LOCALES.flatMap((locale) => SECTION_PATHS.map((section) => ({ locale, section })))
}

const nameFor = (section: SiteSection, locale: string) =>
  locale === 'ar' ? section.ar : section.en

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

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <header>
        <p className="text-gold-700 text-xs uppercase tracking-[0.2em]">
          {locale === 'ar' ? 'اكتشف لبنان' : 'Discover Lebanon'}
        </p>
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
  const { page, ...raw } = await searchParams
  const t = await getTranslations('directory')

  const children = TAXONOMY.find((entry) => entry.slug === section.category)?.children ?? []

  // Validated in one shared place, so this page and the directory reject the
  // same things. See parseFilterState.
  const state = parseFilterState(raw, children)

  /**
   * The listings and the per-governorate counts, in parallel.
   *
   * Sequential would put a second round trip to Frankfurt in front of the
   * render for a number that is decoration on the row above the grid. The
   * counts are cached separately and far more aggressively than the listings -
   * see countByGovernorate - so in practice this is one query plus a cache read.
   */
  const [result, counts] = await Promise.all([
    findListings({
      locale,
      category: section.category,
      ...state,
      page: Number(page) || 1,
    }),
    countByGovernorate({ locale, category: section.category, subcategory: state.subcategory }),
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

  return (
    <>
      {/*
        The count line is hidden at zero, because the empty state below says the
        same sentence. Both rendered, "No places found" appeared twice within a
        few hundred pixels - once as a subtitle and once inside the box - which
        reads as a glitch rather than as emphasis.
      */}
      {result.totalDocs > 0 ? (
        <p className="text-ink-500 mt-3 text-sm">{t('resultCount', { count: result.totalDocs })}</p>
      ) : null}

      <ListingFilters
        base={base}
        state={state}
        subcategories={children}
        locale={locale}
        counts={counts}
      />

      <ListingGrid
        listings={result.docs}
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

      {result.totalPages > 1 ? (
        <nav className="mt-12 flex justify-center gap-3 text-sm" aria-label="Pagination">
          {pageWindow(result.page ?? 1, result.totalPages).map((n, i) =>
            n === 'gap' ? (
              <span key={`gap-${i}`} aria-hidden className="text-ink-300 px-1 py-1">
                &hellip;
              </span>
            ) : (
              <Link
                key={n}
                href={pageHref(n)}
                aria-current={n === result.page ? 'page' : undefined}
                className={
                  n === result.page
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
