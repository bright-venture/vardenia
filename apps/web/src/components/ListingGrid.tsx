import type { Locale } from '@vardenia/i18n'
import type { ListingSummary } from '../lib/listings'
import { ListingCard } from './ListingCard'

/**
 * A page of listings, or the sentence explaining why there are none.
 *
 * Shared by the directory and by all seven section pages. Before this, the grid
 * markup and the card props were written out in each place that showed
 * listings, which is how two views of the same data drift into looking like two
 * different products - and the section pages would have doubled the number of
 * copies on the day they were added.
 */
export function ListingGrid({
  listings,
  locale,
  empty,
}: {
  listings: ListingSummary[]
  locale: Locale
  /** What to say when the filter matches nothing. */
  empty: string
}) {
  if (listings.length === 0) {
    return <p className="text-ink-500 mt-16 text-center">{empty}</p>
  }

  return (
    <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((listing) => (
        <ListingCard
          key={listing.id}
          slug={listing.slug ?? ''}
          name={listing.name ?? ''}
          tagline={listing.tagline}
          category={listing.category}
          governorate={listing.governorate}
          district={listing.district}
          priceRange={listing.priceRange as string | null}
          verified={listing.verified}
          heroImage={listing.heroImage as never}
          locale={locale}
        />
      ))}
    </div>
  )
}
