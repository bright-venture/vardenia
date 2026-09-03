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
 * # Only the first card preloads its image, and only when asked
 *
 * `priority` on every card would have twenty images competing for a phone's
 * bandwidth with the one at the top of the screen. On the first card of a
 * results page it is the largest thing above the fold and worth preloading.
 *
 * This used to apply that to the first card everywhere, which was wrong on two
 * of the five pages that use this grid, and measurably so. On the homepage the
 * grid sits under a full-height hero that is itself `priority`, so the page
 * emitted two `<link rel="preload" as="image">` tags and the one that was not
 * the LCP competed with the one that was - on a throttled mobile connection,
 * which is where Lighthouse measured an LCP of 6.5s. On a listing page the
 * "More like this" grid is at the very bottom, and it preloaded there too, on
 * all 153 of them.
 *
 * So the caller says. `eager` defaults to off, which is the direction that
 * fails quietly rather than expensively, and matches what ui/Plate already says
 * about `priority`: callers opt in per page rather than getting a default that
 * is wrong somewhere.
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
 *
 * `related` is the three suggestions at the foot of a listing page. It reaches
 * three columns a breakpoint earlier than `directory` does, because it holds
 * exactly three cards: at `lg` the directory's two columns would leave the
 * third stranded on a row of its own with a gap beside it.
 */
export type GridKind = 'directory' | 'editorial' | 'related'

const GRIDS: Record<GridKind, string> = {
  /*
    Two columns from the narrowest width, not one.

    The plates are 4:5 now rather than 4:3, so a single column on a phone gave
    one listing per screen and made a 308-entry directory feel endless. Two
    upright cards side by side is what the design draws and what the shape is
    for. Three only at `xl`, because at `lg` a third column takes the cards
    below the width where a name and a place fit on one line each.
  */
  directory: 'grid grid-cols-2 gap-x-5 gap-y-10 xl:grid-cols-3 xl:gap-x-8',
  editorial: 'grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4 lg:gap-x-8',
  related: 'grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-3 lg:gap-x-8',
}

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
  eager = false,
}: {
  listings: ListingSummary[]
  locale: Locale
  /** What to say when the filter matches nothing. */
  empty: string
  /** What the reader can do about it. */
  emptyBody?: string
  emptyAction?: React.ReactNode
  kind?: GridKind
  /**
   * Whether this grid is the first thing on the screen.
   *
   * Only the caller knows. See the note above the component: the grid used to
   * decide for itself and was wrong on two of its five pages.
   */
  eager?: boolean
}) {
  if (listings.length === 0) {
    return <EmptyState title={empty} body={emptyBody} action={emptyAction} />
  }

  const editorial = kind === 'editorial'

  return (
    <div className={GRIDS[kind]}>
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
            priority={eager && index === 0}
            locale={locale}
          />
        </div>
      ))}
    </div>
  )
}
