import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { Hero } from '../../../components/home/Hero'
import { SectionShaderCards } from '../../../components/home/SectionShaderCards'
import { ArticleCard } from '../../../components/ArticleCard'
import { ListingGrid } from '../../../components/ListingGrid'
import { Band, ButtonLink } from '../../../components/ui'
import { findListings, type ListingSummary } from '../../../lib/listings'
import { findArticles } from '../../../lib/articles'

/**
 * The homepage.
 *
 * # What it was
 *
 * A holding page: a heading, two links, and a list of taxonomy categories
 * rendered as unclickable boxes with a subcategory count. It was honest about
 * being unfinished, which is more than the version before it managed, but it
 * was not a front door. Nothing on it showed a single listing or article, which
 * on a directory is the only thing a visitor came for.
 *
 * # What it is
 *
 * Five bands, in the order a first-time visitor needs them:
 *
 * 1. The masthead, which says where this is and why the listings can be trusted.
 * 2. The seven sections, so somebody who knows what they want leaves immediately.
 * 3. Listings, because a directory that shows no places is a brochure.
 * 4. The magazine, because the print edition is half of what this is.
 * 5. One line for business owners, at the bottom where it belongs.
 *
 * # Why the data is fetched here and not in the components
 *
 * The two grids are pure and take what they are given, so they can be dropped
 * onto a section page or an issue page without dragging a query along. This
 * page is the only thing that knows the homepage shows six listings and three
 * articles.
 *
 * # It survives an empty database
 *
 * Both queries can legitimately return nothing: the directory is pre-launch and
 * on some days there genuinely are no published articles. Neither case renders
 * an empty grid with a heading over it. The listings band falls back to an
 * explanation, and the magazine band removes itself entirely rather than
 * announcing a section with nothing in it.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('home')
  const nav = await getTranslations('nav')

  /**
   * Both in parallel. They are independent, and awaiting them in sequence would
   * add the slower one's latency to the faster one's for no reason.
   *
   * `findListings` with no filter is the cacheable path, so this is usually a
   * cache read rather than a round trip to Frankfurt.
   */
  const [listings, articles] = await Promise.all([
    findListings({ locale: locale as Locale, perPage: 6 }),
    findArticles({ locale: locale as Locale, perPage: 3 }),
  ])

  return (
    <main>
      <Hero />

      <Band eyebrow={t('sectionsEyebrow')} title={t('sectionsTitle')} note={t('sectionsNote')}>
        <SectionShaderCards locale={locale as Locale} />
      </Band>

      <Band
        tone="raised"
        eyebrow={t('listingsEyebrow')}
        title={t('listingsTitle')}
        action={
          <ButtonLink href="/directory" variant="outline" size="sm">
            {t('seeAllListings')}
          </ButtonLink>
        }
      >
        <ListingGrid
          listings={listings.docs as ListingSummary[]}
          locale={locale as Locale}
          empty={t('listingsEmpty')}
          emptyBody={t('listingsEmptyBody')}
          emptyAction={
            <ButtonLink href="/magazine" variant="outline" size="sm">
              {nav('magazine')}
            </ButtonLink>
          }
        />
      </Band>

      {/* Removed entirely rather than shown empty. A "From the magazine"
          heading with nothing under it advertises an absence. */}
      {articles.docs.length > 0 ? (
        <Band
          eyebrow={t('magazineEyebrow')}
          title={t('magazineTitle')}
          action={
            <ButtonLink href="/magazine/articles" variant="outline" size="sm">
              {t('allArticles')}
            </ButtonLink>
          }
        >
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {articles.docs.map((article, index) => (
              <ArticleCard
                key={article.id}
                slug={article.slug ?? ''}
                title={article.title ?? ''}
                excerpt={article.excerpt}
                kind={article.kind}
                publishedAt={article.publishedAt}
                heroImage={article.heroImage as never}
                priority={index === 0}
                locale={locale as Locale}
              />
            ))}
          </div>
        </Band>
      ) : null}

      <Band tone="inverse" compact>
        <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <div className="max-w-[52ch]">
            <h2 className="text-surface-base text-2xl sm:text-3xl">{t('businessTitle')}</h2>
            <p className="text-cedar-100/70 mt-3 text-sm leading-relaxed">{t('businessBody')}</p>
          </div>
          <ButtonLink href="/add-your-business" variant="gold" size="lg" className="shrink-0">
            {t('addBusiness')}
          </ButtonLink>
        </div>
      </Band>
    </main>
  )
}
