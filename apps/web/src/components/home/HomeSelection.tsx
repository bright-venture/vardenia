import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import type { HomeListing } from '../../lib/home-listings'
import { HOME_PLACES_LIMIT, isHomeCandidate } from '../../lib/home-selection'
import { Link } from '../../i18n/routing'
import { LinkArrow } from '../LinkArrow'
import { ListingCard } from '../ListingCard'

/** A server-rendered directory introduction, distinct from paid placements. */
export async function HomeSelection({
  listings,
  locale,
}: {
  listings: HomeListing[]
  locale: Locale
}) {
  const places = listings.filter(isHomeCandidate).slice(0, HOME_PLACES_LIMIT)
  if (!places.length) return null
  const t = await getTranslations('homeFinish')
  const h = await getTranslations('home')

  return (
    <section className="vd-home-places vd-home-selection" aria-labelledby="vd-selection-title">
      <header className="vd-home-heading">
        <div>
          <h2 id="vd-selection-title" data-vd-reveal>
            {t('placesTitle')}
          </h2>
          <p data-vd-reveal>{t('placesBody')}</p>
        </div>
        <Link className="vd-text-link" href="/directory">
          {h('seeAllListings')} <LinkArrow />
        </Link>
      </header>
      <ul className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((listing) => (
          <li key={listing.id} className="min-w-0" data-vd-reveal>
            <ListingCard
              slug={listing.slug}
              name={listing.name}
              tagline={listing.tagline}
              category={listing.category}
              governorate={listing.governorate}
              district={listing.district}
              verified={listing.verified}
              heroImage={listing.heroImage}
              locale={locale}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
