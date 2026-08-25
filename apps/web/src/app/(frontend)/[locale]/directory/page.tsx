import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SECTIONS } from '@vardenia/core'
import { isLocale, type Locale } from '@vardenia/i18n'
import { Link } from '../../../../i18n/routing'
import { countByGovernorate, findListings } from '../../../../lib/listings'
import { ListingGrid } from '../../../../components/ListingGrid'
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
  searchParams: Promise<RawFilterParams & { category?: string; page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  return {
    title: locale === 'ar' ? 'الدليل' : 'Directory',
    description:
      locale === 'ar'
        ? 'فنادق ومطاعم وتجارب مختارة في لبنان.'
        : 'Curated hotels, restaurants and experiences across Lebanon.',
  }
}

export default async function DirectoryPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <header>
        <p className="text-gold-700 text-xs uppercase tracking-[0.2em]">
          {locale === 'ar' ? 'اكتشف لبنان' : 'Discover Lebanon'}
        </p>
        <h1 className="font-display text-ink-900 mt-3 text-4xl md:text-5xl">
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

  // In parallel, for the reason given on the section page: the counts are a
  // separate cache entry and should not add a round trip in front of the grid.
  const [result, counts] = await Promise.all([
    findListings({
      locale,
      ...state,
      page: Number(page) || 1,
    }),
    // No category here - /directory is every section at once, so the counts are
    // "listings in this governorate" across the whole directory.
    countByGovernorate({ locale }),
  ])

  const pageHref = (n: number) => {
    const href = filterHref('/directory', state, {})
    return href.includes('?') ? `${href}&page=${n}` : `${href}?page=${n}`
  }

  return (
    <>
      {/* Hidden at zero: the empty state below already says it. */}
      {result.totalDocs > 0 ? (
        <p className="text-ink-500 mt-3 text-sm">{t('resultCount', { count: result.totalDocs })}</p>
      ) : null}

      {/* Navigation, not a filter: these go to the section pages, which is where
          the kind of place is chosen. Kept above the filters so the distinction
          is visible - one row changes the page, the rest narrow it. */}
      <nav className="mt-8 flex flex-wrap gap-2" aria-label="Browse by section">
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

      <ListingGrid
        listings={result.docs}
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
      <div className="bg-surface-sunken mt-3 h-4 w-32 rounded" />
      <div className="mt-8 flex flex-wrap gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="bg-surface-sunken h-10 w-28 rounded-full" />
        ))}
      </div>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bg-surface-sunken aspect-[4/3] rounded-md" />
        ))}
      </div>
    </div>
  )
}
