import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import type { ListingSummary } from '../../lib/listings'
import { ListingCard } from '../ListingCard'
import { Link } from '../../i18n/routing'

export async function HomePlaces({
  listings,
  locale,
  featured = false,
}: {
  listings: ListingSummary[]
  locale: Locale
  featured?: boolean
}) {
  const t = await getTranslations('homeFinish')
  const h = await getTranslations('home')
  if (featured && !listings.length) return null
  return (
    <section
      className={`vd-home-places ${featured ? 'vd-home-sponsored' : ''}`}
      aria-labelledby={featured ? 'vd-featured-title' : 'vd-places-title'}
    >
      <header className="vd-home-heading">
        <div>
          <h2 id={featured ? 'vd-featured-title' : 'vd-places-title'} data-vd-reveal>
            {featured ? h('featuredTitle') : t('placesTitle')}
          </h2>
          <p data-vd-reveal>{featured ? h('featuredNote') : t('placesBody')}</p>
        </div>
        <Link className="vd-text-link" href="/directory">
          {h('seeAllListings')} <span aria-hidden>↗</span>
        </Link>
      </header>
      {listings.length ? (
        <div
          className="vd-home-place-grid"
          data-count={featured ? listings.length : Math.min(listings.length, 3)}
          tabIndex={featured ? 0 : undefined}
          role={featured ? 'region' : undefined}
          aria-label={featured ? h('featuredTitle') : undefined}
        >
          {(featured ? listings : listings.slice(0, 3)).map((listing) => (
            <div key={listing.id} data-vd-reveal>
              <ListingCard
                slug={listing.slug ?? ''}
                name={listing.name ?? ''}
                tagline={listing.tagline}
                category={listing.category}
                governorate={listing.governorate}
                district={listing.district}
                priceRange={listing.priceRange}
                verified={listing.verified}
                heroImage={listing.heroImage as never}
                openingHours={listing.openingHours}
                locale={locale}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="vd-home-empty">
          <p>{t('emptyPlaces')}</p>
          <Link href="/magazine" className="vd-text-link">
            {h('read')} ↗
          </Link>
        </div>
      )}
    </section>
  )
}
