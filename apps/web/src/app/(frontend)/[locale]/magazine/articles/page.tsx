import type { Metadata } from 'next'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@vardenia/i18n'
import { alternatesFor } from '../../../../../lib/seo'
import { Link } from '../../../../../i18n/routing'
import { findArticles } from '../../../../../lib/articles'
import { ArticleCard } from '../../../../../components/ArticleCard'
import { ListingsSkeleton } from '../../../../../components/PageSkeleton'

/**
 * Every article, newest first, regardless of which edition it ran in.
 *
 * # Why the skeleton is here rather than in a loading.tsx
 *
 * It was a `loading.tsx`, and that file also covered `articles/[slug]`, which
 * broke the status code on every missing article. A `loading.tsx` puts its
 * whole subtree behind a Suspense boundary, so Next flushes the response head -
 * status line included - before the page runs, and the `notFound()` that
 * follows can change what is rendered but not what has already been sent.
 * `/magazine/articles/no-such-article` answered 200 with the not-found page in
 * it, and so did every invented listing URL under directory/loading.tsx.
 *
 * Measured on a production build, which is the only place it shows: removing
 * the two loading.tsx files turned four such paths from 200 to 404 and changed
 * nothing else.
 *
 * A boundary declared inside the page covers the page and nothing below it, so
 * the index keeps its skeleton and the article route keeps its status. The
 * directory page had always been written this way; this one had not.
 */

// Cached for an hour and regenerated in the background. See magazine/page.tsx.
export const revalidate = 3600

interface Props {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const ar = locale === 'ar'
  return {
    title: ar ? 'المقالات' : 'Articles',
    description: ar
      ? 'تحقيقات وأدلة وجهات ومقابلات من فاردينيا.'
      : 'Features, destination guides and interviews from Vardenia.',
    alternates: alternatesFor('/magazine/articles', isLocale(locale) ? locale : DEFAULT_LOCALE),
  }
}

export default async function ArticlesPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const ar = locale === 'ar'

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <header>
        <Link href="/magazine" className="text-gold-700 text-xs uppercase tracking-[0.2em]">
          {ar ? 'المجلة' : 'Magazine'}
        </Link>
        <h1 className="font-display text-ink-900 mt-3 text-4xl md:text-5xl">
          {ar ? 'المقالات' : 'Articles'}
        </h1>
      </header>

      {/* `searchParams` is handed over unawaited so this boundary is the only
          thing that blocks on it, matching the directory page. */}
      <Suspense fallback={<ListingsSkeleton />}>
        <ArticleResults locale={locale} searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

/** The part that needs the query string, and therefore the database. */
async function ArticleResults({
  locale,
  searchParams,
}: {
  locale: Locale
  searchParams: Props['searchParams']
}) {
  const ar = locale === 'ar'
  const { page } = await searchParams
  const result = await findArticles({ locale, page: Number(page) || 1 })

  return (
    <>
      {result.docs.length === 0 ? (
        <p className="text-ink-500 mt-16 text-center">
          {ar ? 'لا توجد مقالات بعد.' : 'No articles yet.'}
        </p>
      ) : (
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {result.docs.map((article) => (
            <ArticleCard
              key={article.id}
              slug={article.slug ?? ''}
              title={article.title ?? ''}
              excerpt={article.excerpt}
              kind={article.kind}
              publishedAt={article.publishedAt}
              heroImage={article.heroImage as never}
              locale={locale as Locale}
            />
          ))}
        </div>
      )}

      {result.totalPages > 1 ? (
        <nav className="mt-12 flex justify-center gap-3 text-sm" aria-label="Pagination">
          {Array.from({ length: result.totalPages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={`/magazine/articles?page=${n}`}
              className={
                n === result.page
                  ? 'bg-cedar-900 text-surface-base px-3 py-1 tabular-nums'
                  : 'border-ink-100 text-ink-700 hover:border-ink-300 border px-3 py-1 tabular-nums'
              }
            >
              {n}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  )
}
