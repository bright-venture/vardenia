import type { Locale } from '@vardenia/i18n'
import type { ListingSummary } from '../lib/listings'
import { ListingCard } from './ListingCard'
import { EmptyState } from './ui'

/**
 * A page of listings, or the sentence explaining why there are none.
 *
 * Shared by the directory and by all seven section pages. Before this, the grid
 * markup and the card props were written out in each place that showed
 * listings, which is how two views of the same data drift into looking like two
 * different products - and the section pages would have doubled the number of
 * copies on the day they were added.
 *
 * # The empty case is a component now, not a sentence
 *
 * It used to be a single centred line of grey text. An empty result is the
 * moment a reader is most likely to leave, and a bare "No listings match" tells
 * them nothing about which of their five filters to drop. See ui/EmptyState.
 *
 * # Only the first card preloads its image
 *
 * `priority` on every card would have twenty images competing for a phone's
 * bandwidth with the one at the top of the screen. On the first card it is the
 * largest thing above the fold and worth preloading; below that it is actively
 * harmful.
 */
export function ListingGrid({
  listings,
  locale,
  empty,
  emptyBody,
  emptyAction,
}: {
  listings: ListingSummary[]
  locale: Locale
  /** What to say when the filter matches nothing. */
  empty: string
  /** What the reader can do about it. */
  emptyBody?: string
  emptyAction?: React.ReactNode
}) {
  if (listings.length === 0) {
    return <EmptyState title={empty} body={emptyBody} action={emptyAction} />
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((listing, index) => (
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
          priority={index === 0}
          locale={locale}
        />
      ))}
    </div>
  )
}
