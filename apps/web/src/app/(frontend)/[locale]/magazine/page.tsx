import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { formatDate, isLocale, type Locale } from '@vardenia/i18n'
import { Link } from '../../../../i18n/routing'
import { findArticles } from '../../../../lib/articles'
import { resolveImage } from '../../../../lib/media'
import { kindLabel } from '../../../../lib/editorial'

/** The editorial index. Newest first, no filtering yet. */

interface Props {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const ar = locale === 'ar'
  return {
    title: ar ? 'المجلة' : 'Magazine',
    description: ar
      ? 'تحقيقات وأدلة وجهات من فاردينيا.'
      : 'Features, guides and interviews from Vardenia.',
  }
}

export default async function MagazinePage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const ar = locale === 'ar'
  const { page } = await searchParams
  const result = await findArticles({ locale, page: Number(page) || 1 })

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <header>
        <p className="text-gold-700 text-xs uppercase tracking-[0.2em]">
          {ar ? 'اكتشف لبنان' : 'Discover Lebanon'}
        </p>
        <h1 className="font-display text-ink-900 mt-3 text-4xl md:text-5xl">
          {ar ? 'المجلة' : 'Magazine'}
        </h1>
      </header>

      {result.docs.length === 0 ? (
        <p className="text-ink-500 mt-16 text-center">
          {ar ? 'لا توجد مقالات بعد.' : 'No articles yet.'}
        </p>
      ) : (
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {result.docs.map((article) => {
            const image = resolveImage(article.heroImage as never, 'card')
            return (
              <article key={article.id} className="group">
                <Link href={`/magazine/${article.slug}`} className="block">
                  <div className="bg-surface-sunken relative aspect-[3/2] overflow-hidden rounded-lg">
                    {image ? (
                      <Image
                        src={image.src}
                        alt={image.alt}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : null}
                  </div>

                  <p className="text-ink-300 mt-4 text-xs uppercase tracking-widest">
                    {kindLabel(article.kind, locale as Locale)}
                  </p>
                  <h2 className="font-display text-ink-900 mt-1 text-2xl leading-snug">
                    {article.title}
                  </h2>
                  {article.excerpt ? (
                    <p className="text-ink-500 mt-2 line-clamp-3 text-sm">{article.excerpt}</p>
                  ) : null}
                  {article.publishedAt ? (
                    <time
                      className="text-ink-300 mt-2 block text-xs"
                      dateTime={article.publishedAt}
                    >
                      {formatDate(new Date(article.publishedAt), locale as Locale)}
                    </time>
                  ) : null}
                </Link>
              </article>
            )
          })}
        </div>
      )}

      {result.totalPages > 1 ? (
        <nav className="mt-12 flex justify-center gap-3 text-sm" aria-label="Pagination">
          {Array.from({ length: result.totalPages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={`/magazine?page=${n}`}
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
