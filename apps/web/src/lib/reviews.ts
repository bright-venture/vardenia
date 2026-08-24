import { getPayload } from 'payload'
import type { Locale } from '@vardenia/i18n'
import config from '../payload.config'

/** Same pattern as lib/listings: one local client rather than a shared export. */
const client = async () => getPayload({ config })

/**
 * Reading reviews, and deciding what may honestly be claimed about them.
 *
 * # The rule this file exists to enforce
 *
 * A review's `source` decides three separate things, and they are easy to get
 * subtly wrong in three separate places if the decision is not made once here:
 *
 * 1. Whether it counts towards the average rating shown to a reader.
 * 2. Whether it appears in `Review` structured data, and who is named as author.
 * 3. Whether it may contribute to `aggregateRating`.
 *
 * Google's rules are specific and the penalty for breaking them is losing rich
 * results for the whole domain, not for one page. A publisher may mark up its
 * own critic review, attributed to itself. It may not roll its own reviews into
 * an `aggregateRating`, which is meant to summarise many independent people. And
 * a quote the business supplied about itself is not a review in any sense that
 * survives scrutiny.
 *
 * So: `guest` reviews aggregate. `editorial` reviews are marked up individually
 * with Vardenia as the author and are excluded from the average. `partner`
 * quotes are displayed as quotes and never enter structured data at all.
 */

export type ReviewSource = 'editorial' | 'guest' | 'partner'

export interface ReviewSummary {
  id: string | number
  source: ReviewSource
  rating: number
  title: string
  body: string
  authorName?: string | null
  visitedAt?: string | null
  publishedAt?: string | null
  featured?: boolean | null
}

/** Only guest reviews describe an independent person's rating. */
export const AGGREGATABLE: ReviewSource = 'guest'

/**
 * The average a reader is shown, or null when there is nothing honest to show.
 *
 * Null rather than 0, because a listing with no guest reviews has no rating -
 * which is a different statement from a rating of zero, and rendering a zero
 * would be a libel a directory cannot afford.
 *
 * Rounded to one decimal, which is all the precision a mean of integers over a
 * handful of reviews can carry.
 */
export function aggregateRating(reviews: ReviewSummary[]): { value: number; count: number } | null {
  const guest = reviews.filter((review) => review.source === AGGREGATABLE)
  if (guest.length === 0) return null

  const total = guest.reduce((sum, review) => sum + review.rating, 0)
  return {
    value: Math.round((total / guest.length) * 10) / 10,
    count: guest.length,
  }
}

/**
 * The editorial verdict, which is a single review rather than an average.
 *
 * A listing has at most one that matters. If several exist the most recent
 * wins, because a place changes and the newest visit is the current claim.
 */
export function editorialVerdict(reviews: ReviewSummary[]): ReviewSummary | null {
  const editorial = reviews
    .filter((review) => review.source === 'editorial')
    .sort((a, b) => dateValue(b) - dateValue(a))

  return editorial[0] ?? null
}

function dateValue(review: ReviewSummary): number {
  const raw = review.visitedAt ?? review.publishedAt
  if (!raw) return 0
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Ordering for the reader: pinned first, then most recent.
 *
 * Partner quotes sink to the bottom regardless. They are the least
 * disinterested thing on the page and should not be the first thing read.
 */
export function forDisplay(reviews: ReviewSummary[]): ReviewSummary[] {
  const weight = (review: ReviewSummary) => {
    if (review.source === 'partner') return 2
    if (review.featured) return 0
    return 1
  }

  return [...reviews].sort((a, b) => {
    const byWeight = weight(a) - weight(b)
    if (byWeight !== 0) return byWeight
    return dateValue(b) - dateValue(a)
  })
}

/**
 * Every published review for one listing.
 *
 * `overrideAccess: false` so the collection's own read rule applies and drafts
 * stay invisible to the public, exactly as they do for listings and articles.
 */
export async function findReviewsForBusiness(
  businessId: string | number,
  locale: Locale,
): Promise<ReviewSummary[]> {
  const payload = await client()

  const result = await payload.find({
    collection: 'reviews',
    where: { business: { equals: businessId } },
    locale,
    depth: 0,
    // A listing with more than this many reviews is a problem worth having and
    // a pagination story to write then. The cap stops one listing from being
    // able to make its own page arbitrarily slow.
    limit: 24,
    sort: ['-publishedAt', '-createdAt'],
    overrideAccess: false,
  })

  return result.docs.map((doc): ReviewSummary => ({
    id: doc.id,
    source: (doc.source ?? 'editorial') as ReviewSource,
    rating: typeof doc.rating === 'number' ? doc.rating : 0,
    title: doc.title ?? '',
    body: doc.body ?? '',
    authorName: doc.authorName,
    visitedAt: doc.visitedAt,
    publishedAt: doc.publishedAt,
    featured: doc.featured,
  }))
}
