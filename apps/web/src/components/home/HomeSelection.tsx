import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import type { HomeListing } from '../../lib/home-listings'
import {
  HOME_PLACES_DESKTOP_LIMIT,
  HOME_PLACES_LIMIT,
  isHomeCandidate,
} from '../../lib/home-selection'
import { Link } from '../../i18n/routing'
import { LinkArrow } from '../LinkArrow'
import { ListingCard } from '../ListingCard'
import { HomePlaceSets } from './HomePlaceSets'

/** A server-rendered directory introduction, distinct from paid placements. */
export async function HomeSelection({
  listings,
  locale,
  directoryShown = true,
}: {
  listings: HomeListing[]
  locale: Locale
  /** Whether the directory is shown (lib/hidden-pages); hidden, it is not linked. */
  directoryShown?: boolean
}) {
  const limit = locale === 'en' ? HOME_PLACES_DESKTOP_LIMIT : HOME_PLACES_LIMIT
  const places = listings.filter(isHomeCandidate).slice(0, limit)
  if (!places.length) return null
  const t = await getTranslations('homeFinish')
  const h = await getTranslations('home')

  const cards = places.map((listing) => ({
    key: listing.id,
    content: (
      <ListingCard
        slug={listing.slug}
        name={listing.name}
        tagline={listing.tagline}
        category={listing.category}
        governorate={listing.governorate}
        city={listing.city}
        verified={listing.verified}
        heroImage={listing.heroImage}
        locale={locale}
      />
    ),
  }))

  return (
    <section
      id="featured-places"
      className="vd-home-places vd-home-selection"
      aria-labelledby="vd-selection-title"
    >
      <header className="vd-home-heading">
        <div>
          <h2 id="vd-selection-title" data-vd-reveal>
            {t('placesTitle')}
          </h2>
          <p data-vd-reveal>{t('placesBody')}</p>
        </div>
        {directoryShown ? (
          <Link className="vd-text-link" href="/directory">
            {h('seeAllListings')} <LinkArrow />
          </Link>
        ) : null}
      </header>
      {locale === 'en' ? (
        <HomePlaceSets cards={cards} />
      ) : (
        <ul className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.key} className="min-w-0" data-vd-reveal>
              {card.content}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
