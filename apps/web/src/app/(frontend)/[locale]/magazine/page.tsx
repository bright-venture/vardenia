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
 * Revalidate every hour. This number is the one every cached page copies.
 *
 * Without it the page is prerendered once at build and never again: publishing
 * an issue would leave the live site showing the old one until the next deploy.
 * That was the actual behaviour before this line existed.
 *
 * # Why an hour, when it was a minute
 *
 * A minute was chosen against database latency alone - a round trip costs 300ms,
 * a minute-old list costs nothing - and on that reasoning shorter always looked
 * better. It missed that on a host billing for compute, every expiry is a
 * function invocation and two queries to Frankfurt, paid the next time anybody
 * asks for the page.
 *
 * # How much this actually saves today: less than it looks
 *
 * Regeneration is request-driven, not a timer, so a page nobody visits costs
 * nothing at any window. A live listing page was serving with `Age: 13299` -
 * stale for three and a half hours - which is what low traffic against a
 * sixty-second window really looks like.
 *
 * So this is insurance rather than a measured saving: it is the number that
 * decides the bill the day the magazine ships and the scans start. Under real
 * traffic a minute means one reader refreshing a page regenerates it sixty times
 * an hour, for editorial that changes when a person presses a button.
 *
 * # It costs the reader nothing
 *
 * Stale-while-revalidate: a stale page is served immediately and refreshed
 * behind the request. Lengthening the window changes how current the content is,
 * never how long anybody waits for it.
 *
 * # An hour is not how long an edit takes to appear
 *
 * Publishing anything in Businesses fires `revalidateTag('businesses')` - see
 * hooks/revalidateListings, which exists because a stale directory read as a
 * broken filter. That clears the cached queries immediately, whatever this says.
 * The window is the ceiling for a change made behind Payload's back, straight in
 * the database.
 */
export const revalidate = 3600

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
