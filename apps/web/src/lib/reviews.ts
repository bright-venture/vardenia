import { getPayload } from 'payload'
import config from '../payload.config'

/**
 * The read side of reviews: what a listing page shows.
 *
 * Only published reviews, and that is enforced by the collection's own read
 * access (see Reviews) rather than by a filter here - `overrideAccess: false`
 * means an anonymous page read gets exactly what an anonymous API caller would,
 * which is published rows and nothing pending or rejected.
 *
 * The average is taken over the fetched set. The cap is generous enough that it
 * is the true average until a single listing has hundreds of reviews, at which
 * point the fix is a `avg()` in SQL - not a concern at this catalogue.
 */

export interface PublicReview {
  id: number
  authorName: string
  rating: number
  title: string | null
  body: string
  createdAt: string
}

export interface ListingReviews {
  /** Mean rating, one decimal, or null when there are no reviews. */
  average: number | null
  /** How many published reviews the listing has. */
  count: number
  /** The most recent few, newest first. */
  reviews: PublicReview[]
}

const AVERAGE_CAP = 200

const client = async () => getPayload({ config })

export async function listingReviews(
  businessId: number | string,
  limit = 8,
): Promise<ListingReviews> {
  const payload = await client()
  const result = await payload.find({
    collection: 'reviews',
    where: { and: [{ business: { equals: businessId } }, { status: { equals: 'published' } }] },
    sort: '-createdAt',
    limit: AVERAGE_CAP,
    depth: 0,
    overrideAccess: false,
  })

  const ratings = result.docs
    .map((doc) => (typeof doc.rating === 'number' ? doc.rating : null))
    .filter((r): r is number => r !== null)

  const average =
    ratings.length > 0
      ? Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10
      : null

  const reviews: PublicReview[] = result.docs.slice(0, limit).map((doc) => ({
    id: Number(doc.id),
    authorName: typeof doc.authorName === 'string' ? doc.authorName : '',
    rating: typeof doc.rating === 'number' ? doc.rating : 0,
    title: typeof doc.title === 'string' && doc.title.trim() ? doc.title : null,
    body: typeof doc.body === 'string' ? doc.body : '',
    createdAt: String(doc.createdAt ?? ''),
  }))

  return { average, count: result.totalDocs, reviews }
}

/**
 * Reviews needed before a listing's heading shows an average.
 *
 * One five-star review makes a "5.0" that reads as a verdict and is an
 * anecdote. Below this the heading links to the count alone; the score is still
 * shown beside the reviews themselves, where the count sits next to it.
 */
export const SCORE_MIN_REVIEWS = 3

export interface ReviewHighlight {
  id: number
  authorName: string
  rating: number
  quote: string
}

/** Longest a highlighted quote runs before it is cut at a word. */
const QUOTE_MAX = 140

/**
 * A line or two from the best recent reviews, for the top of a listing.
 *
 * Only four and five stars: this is the "guests who stayed here loved" line,
 * placed where a reader decides, and the full list below keeps every review,
 * good or bad, so nothing is hidden. The first sentence of each, cut at a word
 * if it runs long, because a quote that needs scrolling is not a highlight.
 */
export function reviewHighlights(reviews: PublicReview[], count = 2): ReviewHighlight[] {
  return reviews
    .filter((review) => review.rating >= 4 && review.body.trim())
    .slice(0, count)
    .map((review) => {
      const text = review.body.replace(/\s+/g, ' ').trim()
      const sentence = text.match(/^(.{20,}?[.!?؟。])(\s|$)/u)?.[1] ?? text
      const quote =
        sentence.length <= QUOTE_MAX
          ? sentence
          : `${sentence
              .slice(0, QUOTE_MAX)
              .replace(/\s+\S*$/u, '')
              .replace(/[\s,;:]+$/u, '')}…`
      return { id: review.id, authorName: review.authorName, rating: review.rating, quote }
    })
}
