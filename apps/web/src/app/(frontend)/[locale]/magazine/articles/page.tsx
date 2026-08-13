import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { isLocale, type Locale } from '@vardenia/i18n'
import { Link } from '../../../../../i18n/routing'
import { findArticles } from '../../../../../lib/articles'
import { ArticleCard } from '../../../../../components/ArticleCard'

/** Every article, newest first, regardless of which edition it ran in. */

// Cached for 60s and regenerated in the background. See magazine/page.tsx.
export const revalidate = 60

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
  }
}

export default async function ArticlesPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const ar = locale === 'ar'
  const { page } = await searchParams
  const result = await findArticles({ locale, page: Number(page) || 1 })

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
                  ? 'bg-ink-900 text-surface-base rounded-md px-3 py-1 tabular-nums'
                  : 'border-ink-100 text-ink-700 hover:border-ink-300 rounded-md border px-3 py-1 tabular-nums'
              }
            >
              {n}
            </Link>
          ))}
        </nav>
      ) : null}
    </main>
  )
}
