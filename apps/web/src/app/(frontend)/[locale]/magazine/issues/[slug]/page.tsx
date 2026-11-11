import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hiddenPages, notFoundIfHidden } from '../../../../../../lib/hidden-pages'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { LOCALES, formatDate, isLocale, type Locale } from '@vardenia/i18n'
import { Link } from '../../../../../../i18n/routing'
import {
  findArticlesInIssue,
  findIssueBySlug,
  findAllIssueSlugs,
  findListingsInIssue,
} from '../../../../../../lib/issues'
import { GOVERNORATES } from '@vardenia/core/regions'
import { governorateLabel } from '../../../../../../lib/labels'
import { ListingGrid } from '../../../../../../components/ListingGrid'
import { buildMetadata } from '../../../../../../lib/seo'
import { MagazineCover } from '../../../../../../components/magazine/MagazineCover'
import { MagazineReader } from '../../../../../../components/magazine/MagazineReader'
import { ArticleCard } from '../../../../../../components/ArticleCard'

/**
 * One printed edition, and everything in it.
 *
 * This is the digital table of contents for a physical object, so articles are
 * listed in page order rather than by date. It is also where a QR code printed
 * on the cover lands.
 */

// Cached for an hour and regenerated in the background. See magazine/page.tsx.
export const revalidate = 3600

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

  // Issues carry no SEO group - there are few of them and their metadata is
  // formulaic - so the fallbacks do all the work here.
  const t = await getTranslations({ locale })
  return buildMetadata({
    seo: undefined,
    title: issue.title,
    description: t('magazine.issueMetaDescription', { number: issue.issueNumber }),
    fallbackImage: issue.cover as never,
    path: `/magazine/issues/${slug}`,
    locale,
  })
}

export default async function IssuePage({ params }: Params) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  // Hiding Issues hides each issue too.
  await notFoundIfHidden('magazine-issues')
  setRequestLocale(locale)

  const issue = await findIssueBySlug(slug, locale)
  if (!issue) notFound()

  const t = await getTranslations()
  const [articles, listings, hidden] = await Promise.all([
    findArticlesInIssue(issue.id, locale),
    findListingsInIssue(issue.id, locale),
    hiddenPages(),
  ])
  // With Articles hidden (lib/hidden-pages), their block goes: it links to them.
  const articlesShown = !hidden.includes('magazine-articles')
  // The magazine's seven regions in its order, each with its places; a
  // listing with no region (none today) closes the list rather than vanishing.
  const known = new Set<string>(GOVERNORATES.map((g) => g.slug))
  const regions = [
    ...GOVERNORATES.map((g) => ({
      slug: g.slug as string,
      name: governorateLabel(g.slug, locale as Locale),
      listings: listings.filter((l) => l.governorate === g.slug),
    })),
    {
      slug: 'other',
      name: t('magazine.placesInIssue'),
      listings: listings.filter((l) => !l.governorate || !known.has(l.governorate)),
    },
  ].filter((region) => region.listings.length > 0)
  // A file in Magazine PDFs (collections/Editions): a PDF, so its own address
  // rather than an image size.
  const pdf =
    issue.digitalEdition && typeof issue.digitalEdition === 'object' ? issue.digitalEdition : null
  const edition = pdf?.url ? { src: pdf.url } : null
  const hasPdf = pdf?.mimeType === 'application/pdf'

  return (
    <main className="vd-issue-page mx-auto max-w-6xl px-6 py-16">
      <Link href="/magazine/issues" className="text-gold-700 text-xs uppercase tracking-[0.2em]">
        {t('magazine.issues')}
      </Link>

      <div className="vd-issue-header mt-6 grid gap-10 md:grid-cols-[260px_minmax(0,1fr)]">
        <MagazineCover
          media={issue.cover as never}
          sizes="(max-width:700px) 100vw, 260px"
          priority
        />

        <div>
          <p className="text-ink-500 text-xs uppercase tabular-nums tracking-widest">
            {t('magazine.issueNumber', { number: issue.issueNumber })}
          </p>
          <h1
            dir="auto"
            className="font-display text-ink-900 mt-2 text-4xl leading-tight md:text-5xl"
          >
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
                {t('magazine.pageCount', { count: issue.pageCount })}
              </span>
            ) : null}
          </div>

          {/*
            Print run is staff-facing intelligence, not reader-facing. It is what
            turns a scan count into a rate, and it stays off the public page.
          */}

          {edition ? (
            <a
              href={hasPdf ? '#digital-edition' : edition.src}
              className="bg-cedar-900 text-surface-base hover:bg-cedar-700 mt-8 inline-block px-5 py-3 text-sm font-semibold transition-colors"
            >
              {t('magazine.readDigital')}
            </a>
          ) : null}
        </div>
      </div>

      {edition && hasPdf ? (
        <MagazineReader
          src={`/read/issue/${encodeURIComponent(slug)}`}
          originalSrc={edition.src}
          title={issue.title}
          locale={locale}
        />
      ) : null}

      {articlesShown ? (
        <section className="mt-16">
          <h2 dir="auto" className="text-ink-500 text-xs uppercase tracking-widest">
            {t('magazine.inThisIssue')}
          </h2>
          <h3 className="vd-issue-subhead">{t('footer.articles')}</h3>

          {articles.length === 0 ? (
            <p className="text-ink-500 mt-4 text-sm">{t('magazine.noArticlesInIssue')}</p>
          ) : (
            <div className="vd-editorial-grid mt-6 grid gap-8 sm:grid-cols-2">
              {articles.map((article) => {
                const print = article.print as {
                  pageFrom?: number | null
                  pageTo?: number | null
                } | null
                const from = print?.pageFrom
                const to = print?.pageTo
                const isRange = to != null && to !== from
                const range = isRange ? `${from}-${to}` : String(from)
                const pageLabel =
                  from != null ? t('article.pageLabel', { count: isRange ? 2 : 1, range }) : null

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
      ) : null}

      {/*
        Every place the edition carries, under the articles, region by region
        in the magazine's own order (11 November 2026). A long list on a
        phone, so the regions are also a row of links to jump between.
      */}
      {regions.length > 0 ? (
        <section className="vd-issue-places" aria-labelledby="issue-places">
          <h2 id="issue-places" dir="auto">
            {t('magazine.placesInIssue')}
          </h2>
          <p className="text-ink-500 mt-2 text-sm tabular-nums">
            {t('magazine.placesCount', { count: listings.length })}
          </p>
          <nav aria-label={t('magazine.regionsInIssue')} className="vd-issue-regions">
            {regions.map((region) => (
              <a key={region.slug} href={`#region-${region.slug}`}>
                {region.name}
                <span className="tabular-nums">{region.listings.length}</span>
              </a>
            ))}
          </nav>
          {regions.map((region) => (
            <section
              key={region.slug}
              id={`region-${region.slug}`}
              aria-labelledby={`region-${region.slug}-title`}
              className="vd-issue-region"
            >
              <h3 id={`region-${region.slug}-title`} className="vd-issue-subhead">
                {region.name}
                <span className="tabular-nums">{region.listings.length}</span>
              </h3>
              <ListingGrid
                listings={region.listings}
                locale={locale as Locale}
                empty=""
                kind="directory"
              />
            </section>
          ))}
        </section>
      ) : null}
    </main>
  )
}
