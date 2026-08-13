import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { LOCALES, formatDate, isLocale, type Locale } from '@vardenia/i18n'
import { Link } from '../../../../../../i18n/routing'
import {
  findArticlesInIssue,
  findIssueBySlug,
  findAllIssueSlugs,
} from '../../../../../../lib/issues'
import { resolveImage } from '../../../../../../lib/media'
import { ArticleCard } from '../../../../../../components/ArticleCard'

/**
 * One printed edition, and everything in it.
 *
 * This is the digital table of contents for a physical object, so articles are
 * listed in page order rather than by date. It is also where a QR code printed
 * on the cover lands.
 */

// Cached for 60s and regenerated in the background. See magazine/page.tsx.
export const revalidate = 60

interface Params {
  params: Promise<{ locale: string; slug: string }>
}

/**
 * Prerender every known slug, at both locales.
 *
 * Without this the route has no static params, so Next serves it fully dynamic:
 * the response carried "Cache-Control: no-store" and every single request paid
 * for the database round trips. With it, pages are built once and then served
 * from cache, refreshed by the revalidate window above.
 *
 * `dynamicParams` stays at its default of true, so a slug created after the
 * build still renders on demand rather than 404ing - it just misses the cache
 * the first time.
 */
export async function generateStaticParams() {
  const slugs = await findAllIssueSlugs()
  return LOCALES.flatMap((locale) => slugs.map((slug) => ({ locale, slug })))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}

  const issue = await findIssueBySlug(slug, locale)
  if (!issue) return {}

  const cover = resolveImage(issue.cover as never, 'portrait')

  return {
    title: issue.title,
    description:
      locale === 'ar'
        ? `العدد ${issue.issueNumber} من فاردينيا.`
        : `Issue ${issue.issueNumber} of Vardenia.`,
    openGraph: {
      title: issue.title ?? undefined,
      images: cover ? [{ url: cover.src }] : undefined,
      type: 'website',
    },
    alternates: {
      canonical: `/magazine/issues/${slug}`,
      languages: { en: `/magazine/issues/${slug}`, ar: `/ar/magazine/issues/${slug}` },
    },
  }
}

export default async function IssuePage({ params }: Params) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const issue = await findIssueBySlug(slug, locale)
  if (!issue) notFound()

  const ar = locale === 'ar'
  const cover = resolveImage(issue.cover as never, 'portrait')
  const articles = await findArticlesInIssue(issue.id, locale)
  const edition = resolveImage(issue.digitalEdition as never, 'card')

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <Link href="/magazine/issues" className="text-gold-700 text-xs uppercase tracking-[0.2em]">
        {ar ? 'الأعداد' : 'Issues'}
      </Link>

      <div className="mt-6 grid gap-10 md:grid-cols-[260px_minmax(0,1fr)]">
        <div className="bg-surface-sunken relative aspect-[3/4] overflow-hidden rounded-md">
          {cover ? (
            <Image
              src={cover.src}
              alt={cover.alt}
              fill
              priority
              sizes="260px"
              className="object-cover"
            />
          ) : null}
        </div>

        <div>
          <p className="text-ink-300 text-xs uppercase tabular-nums tracking-widest">
            {ar ? `العدد ${issue.issueNumber}` : `Issue ${issue.issueNumber}`}
          </p>
          <h1 className="font-display text-ink-900 mt-2 text-4xl leading-tight md:text-5xl">
            {issue.title}
          </h1>

          <div className="text-ink-500 mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {issue.season ? <span>{issue.season}</span> : null}
            {issue.publishedAt ? (
              <time dateTime={issue.publishedAt}>
                {formatDate(new Date(issue.publishedAt), locale as Locale)}
              </time>
            ) : null}
            {issue.pageCount ? (
              <span className="tabular-nums">
                {ar ? `${issue.pageCount} صفحة` : `${issue.pageCount} pages`}
              </span>
            ) : null}
          </div>

          {/*
            Print run is staff-facing intelligence, not reader-facing. It is what
            turns a scan count into a rate, and it stays off the public page.
          */}

          {edition ? (
            <a
              href={edition.src}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-ink-900 text-surface-base hover:bg-ink-700 mt-8 inline-block rounded-md px-5 py-3 text-sm font-semibold transition-colors"
            >
              {ar ? 'تصفح النسخة الرقمية' : 'Read the digital edition'}
            </a>
          ) : null}
        </div>
      </div>

      <section className="mt-16">
        <h2 className="text-ink-300 text-xs uppercase tracking-widest">
          {ar ? 'في هذا العدد' : 'In this issue'}
        </h2>

        {articles.length === 0 ? (
          <p className="text-ink-500 mt-4 text-sm">
            {ar
              ? 'لم تُضف مقالات إلى هذا العدد بعد.'
              : 'No articles have been added to this issue yet.'}
          </p>
        ) : (
          <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => {
              const print = article.print as {
                pageFrom?: number | null
                pageTo?: number | null
              } | null
              const from = print?.pageFrom
              const to = print?.pageTo
              const pageLabel =
                from != null
                  ? ar
                    ? `صفحة ${to != null && to !== from ? `${from}-${to}` : from}`
                    : `Page${to != null && to !== from ? 's' : ''} ${to != null && to !== from ? `${from}-${to}` : from}`
                  : null

              return (
                <ArticleCard
                  key={article.id}
                  slug={article.slug ?? ''}
                  title={article.title ?? ''}
                  excerpt={article.excerpt}
                  kind={article.kind}
                  heroImage={article.heroImage as never}
                  locale={locale as Locale}
                  pageLabel={pageLabel}
                />
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
