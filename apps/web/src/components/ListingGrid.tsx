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
/**
 * Where the grid is being used, which decides its shape.
 *
 * `directory` is the working grid: an even three columns, every card the same
 * size, because somebody scanning two hundred listings is comparing them and
 * anything that makes one louder than another is in the way.
 *
 * `editorial` is the homepage band from the 2026 design: four columns, the
 * first card twice as wide and twice as tall, the fourth dropped half a card.
 * Nobody is comparing here - it is a taste of the directory, and the
 * asymmetry is what makes six listings read as a spread rather than as the
 * first page of results.
 */
export type GridKind = 'directory' | 'editorial'

/** What each card contributes to the editorial layout, by position. */
const EDITORIAL_SPANS: Record<number, string> = {
  0: 'col-span-2 lg:row-span-2',
  3: 'lg:translate-y-12',
}

export function ListingGrid({
  listings,
  locale,
  empty,
  emptyBody,
  emptyAction,
  kind = 'directory',
}: {
  listings: ListingSummary[]
  locale: Locale
  /** What to say when the filter matches nothing. */
  empty: string
  /** What the reader can do about it. */
  emptyBody?: string
  emptyAction?: React.ReactNode
  kind?: GridKind
}) {
  if (listings.length === 0) {
    return <EmptyState title={empty} body={emptyBody} action={emptyAction} />
  }

  const editorial = kind === 'editorial'

  return (
    <div
      className={
        editorial
          ? 'grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4 lg:gap-x-8'
          : 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3'
      }
    >
      {listings.map((listing, index) => (
        <div key={listing.id} className={editorial ? EDITORIAL_SPANS[index] : undefined}>
          <ListingCard
            slug={listing.slug ?? ''}
            name={listing.name ?? ''}
            tagline={listing.tagline}
            category={listing.category}
            governorate={listing.governorate}
            district={listing.district}
            priceRange={listing.priceRange as string | null}
            verified={listing.verified}
            googleRating={listing.googleRating}
            googleRatingCount={listing.googleRatingCount}
            heroImage={listing.heroImage as never}
            priority={index === 0}
            locale={locale}
          />
        </div>
      ))}
    </div>
  )
}
