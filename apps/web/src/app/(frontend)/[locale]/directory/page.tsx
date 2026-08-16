import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { TAXONOMY } from '@vardenia/core'
import { isLocale, type Locale } from '@vardenia/i18n'
import { Link } from '../../../../i18n/routing'
import { findListings } from '../../../../lib/listings'
import { ListingCard } from '../../../../components/ListingCard'
import { categoryLabel } from '../../../../lib/labels'

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
  searchParams: Promise<{ category?: string; page?: string }>
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
  const { category, page } = await searchParams
  const t = await getTranslations('directory')

  const result = await findListings({
    locale,
    category,
    page: Number(page) || 1,
  })

  return (
    <>
      <p className="text-ink-500 mt-3 text-sm">{t('resultCount', { count: result.totalDocs })}</p>

      <nav className="mt-8 flex flex-wrap gap-2" aria-label="Filter by category">
        <FilterChip href="/directory" active={!category}>
          {locale === 'ar' ? 'الكل' : 'All'}
        </FilterChip>
        {TAXONOMY.map((entry) => (
          <FilterChip
            key={entry.slug}
            href={`/directory?category=${entry.slug}`}
            active={category === entry.slug}
          >
            {categoryLabel(entry.slug, locale)}
          </FilterChip>
        ))}
      </nav>

      {result.docs.length === 0 ? (
        <p className="text-ink-500 mt-16 text-center">{t('resultCount', { count: 0 })}</p>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {result.docs.map((listing) => (
            <ListingCard
              key={listing.id}
              slug={listing.slug ?? ''}
              name={listing.name ?? ''}
              tagline={listing.tagline}
              category={listing.category}
              governorate={listing.governorate}
              district={listing.district}
              priceRange={listing.priceRange as string | null}
              verified={listing.verified}
              heroImage={listing.heroImage as never}
              locale={locale}
            />
          ))}
        </div>
      )}

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
                href={
                  category ? `/directory?category=${category}&page=${n}` : `/directory?page=${n}`
                }
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

function FilterChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'bg-ink-900 text-surface-base rounded-full px-4 py-2 text-sm'
          : 'border-ink-100 text-ink-700 hover:border-ink-300 rounded-full border px-4 py-2 text-sm transition-colors'
      }
    >
      {children}
    </Link>
  )
}
