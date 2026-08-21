import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SECTION_PATHS, TAXONOMY, sectionForPath, type SiteSection } from '@vardenia/core'
import { LOCALES, isLocale, type Locale } from '@vardenia/i18n'
import { Link } from '../../../../i18n/routing'
import { findListings } from '../../../../lib/listings'
import { subcategoryLabel } from '../../../../lib/labels'
import { ListingGrid } from '../../../../components/ListingGrid'
import { FilterChip } from '../../../../components/FilterChip'
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

export const revalidate = 60

interface Props {
  params: Promise<{ locale: string; section: string }>
  searchParams: Promise<{ filter?: string; page?: string }>
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

  return { title: nameFor(section, locale) }
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
  const { filter, page } = await searchParams
  const t = await getTranslations('directory')

  const children = TAXONOMY.find((entry) => entry.slug === section.category)?.children ?? []

  /**
   * A filter from the query string is only trusted if it belongs to this
   * section. Without the check, `/stay?filter=photographers` would run a query
   * that can never match and present an empty page as though the section were
   * empty - and every crafted value would earn its own cache entry.
   */
  const subcategory = children.some((child) => child.slug === filter) ? filter : undefined

  const result = await findListings({
    locale,
    category: section.category,
    subcategory,
    page: Number(page) || 1,
  })

  const base = `/${section.path}`
  const withFilter = (slug?: string) => (slug ? `${base}?filter=${slug}` : base)

  return (
    <>
      <p className="text-ink-500 mt-3 text-sm">{t('resultCount', { count: result.totalDocs })}</p>

      <nav className="mt-8 flex flex-wrap gap-2" aria-label={nameFor(section, locale)}>
        <FilterChip href={base} active={!subcategory}>
          {locale === 'ar' ? 'الكل' : 'All'}
        </FilterChip>
        {children.map((child) => (
          <FilterChip
            key={child.slug}
            href={withFilter(child.slug)}
            active={subcategory === child.slug}
          >
            {subcategoryLabel(child.slug, locale)}
          </FilterChip>
        ))}
      </nav>

      <ListingGrid listings={result.docs} locale={locale} empty={t('resultCount', { count: 0 })} />

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
                href={subcategory ? `${base}?filter=${subcategory}&page=${n}` : `${base}?page=${n}`}
                aria-current={n === result.page ? 'page' : undefined}
                className={
                  n === result.page
                    ? 'bg-ink-900 text-surface-base rounded-md px-3 py-1 tabular-nums'
                    : 'border-ink-100 text-ink-700 hover:border-ink-300 rounded-md border px-3 py-1 tabular-nums'
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
        <div key={n} className="bg-surface-sunken h-64 animate-pulse rounded-lg" />
      ))}
    </div>
  )
}
