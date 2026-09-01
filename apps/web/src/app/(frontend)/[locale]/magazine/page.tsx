import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@vardenia/i18n'
import { alternatesFor } from '../../../../lib/seo'
import { Link } from '../../../../i18n/routing'
import { findArticles } from '../../../../lib/articles'
import { findIssues } from '../../../../lib/issues'
import { resolveImage } from '../../../../lib/media'
import { ArticleCard } from '../../../../components/ArticleCard'
import { ButtonLink } from '../../../../components/ui'

/**
 * The magazine hub: the current edition, then recent stories.
 *
 * Deliberately not a third list. It answers "what is out now" and "what should
 * I read", and sends anyone who wants everything to /articles or /issues.
 */

/**
 * Revalidate every 60 seconds.
 *
 * Without this the page is prerendered once at build and never again: publishing
 * an issue would leave the live site showing the old one until the next deploy.
 * That was the actual behaviour before this line existed.
 *
 * 60 seconds because everything here is published editorial, not live data. A
 * reader seeing a minute-old list costs nothing; a database round trip on every
 * request costs 300ms and scales with traffic.
 */
export const revalidate = 60

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const ar = locale === 'ar'
  return {
    title: ar ? 'المجلة' : 'Magazine',
    description: ar
      ? 'تحقيقات وأدلة وجهات وأعداد فاردينيا المطبوعة.'
      : 'Features, destination guides and the Vardenia print archive.',
    alternates: alternatesFor('/magazine', isLocale(locale) ? locale : DEFAULT_LOCALE),
  }
}

export default async function MagazinePage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const ar = locale === 'ar'
  const [articles, issues] = await Promise.all([
    findArticles({ locale, perPage: 6 }),
    findIssues(locale),
  ])

  const current = issues.docs[0]
  const cover = current ? resolveImage(current.cover as never, 'portrait') : null

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

      {current ? (
        <section className="border-ink-100 mt-12 grid gap-8 border-t pt-12 md:grid-cols-[200px_minmax(0,1fr)]">
          <Link href={`/magazine/issues/${current.slug}`} className="group block">
            <div className="bg-surface-sunken relative aspect-[3/4] overflow-hidden">
              {cover ? (
                <Image
                  src={cover.src}
                  alt={cover.alt}
                  fill
                  sizes="200px"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : null}
            </div>
          </Link>

          <div>
            <p className="text-ink-500 text-xs uppercase tracking-widest">
              {ar ? 'العدد الحالي' : 'Current issue'}
            </p>
            <h2 className="font-display text-ink-900 mt-2 text-3xl leading-snug">
              <Link href={`/magazine/issues/${current.slug}`}>{current.title}</Link>
            </h2>
            {current.season ? <p className="text-ink-500 mt-2 text-sm">{current.season}</p> : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href={`/magazine/issues/${current.slug}`} variant="solid">
                {ar ? 'ماذا في هذا العدد' : 'What is in this issue'}
              </ButtonLink>
              <ButtonLink href="/magazine/issues" variant="outline">
                {ar ? 'كل الأعداد' : 'All issues'}
              </ButtonLink>
            </div>
          </div>
        </section>
      ) : null}

      <section className="border-ink-100 mt-16 border-t pt-12">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-ink-500 text-xs uppercase tracking-widest">
            {ar ? 'أحدث المقالات' : 'Latest articles'}
          </h2>
          <Link
            href="/magazine/articles"
            className="text-gold-700 text-sm underline underline-offset-4"
          >
            {ar ? 'كل المقالات' : 'All articles'}
          </Link>
        </div>

        {articles.docs.length === 0 ? (
          <p className="text-ink-500 mt-6 text-sm">
            {ar ? 'لا توجد مقالات بعد.' : 'No articles yet.'}
          </p>
        ) : (
          <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {articles.docs.map((article) => (
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
      </section>
    </main>
  )
}
