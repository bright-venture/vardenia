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
