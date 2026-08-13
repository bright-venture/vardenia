import { cache } from 'react'
import { getPayload, type Where } from 'payload'
import type { Locale } from '@vardenia/i18n'
import config from '../payload.config'

/**
 * Read side for the public directory.
 *
 * Every query here runs with `overrideAccess: false`, which is what makes these
 * pages safe. Payload then applies the same rules an anonymous API caller gets:
 * drafts are filtered out at the database level, and the staff-only fields on
 * the Commercial tab are stripped from the result. A page cannot leak a contract
 * value by accident because it never receives one.
 */

export type ListingSummary = Awaited<ReturnType<typeof findListings>>['docs'][number]
export type Listing = NonNullable<Awaited<ReturnType<typeof findListingBySlug>>>

const client = async () => getPayload({ config })

/**
 * Wrapped in `cache()` because every detail page loads it twice.
 *
 * Next calls `generateMetadata` and the page component separately, and both need
 * the same document, so the naive version issued two identical queries to
 * Supabase for one page view. `cache()` dedupes them within a single request:
 * the second caller gets the first one's promise.
 *
 * This is per-request memoisation, not a cache with a lifetime. Nothing is held
 * between requests, so a published edit still shows up immediately.
 */
export const findListingBySlug = cache(async (slug: string, locale: Locale) => {
  const payload = await client()
  const result = await payload.find({
    collection: 'businesses',
    where: { slug: { equals: slug } },
    locale,
    // Deep enough to resolve hero image, gallery and logo in one round trip.
    depth: 2,
    limit: 1,
    overrideAccess: false,
  })
  return result.docs[0] ?? null
})

export interface ListingQuery {
  locale: Locale
  category?: string
  governorate?: string
  page?: number
  perPage?: number
}

export async function findListings({
  locale,
  category,
  governorate,
  page = 1,
  perPage = 24,
}: ListingQuery) {
  const payload = await client()

  const where: Where = {}
  if (category) where.category = { equals: category }
  if (governorate) where.governorate = { equals: governorate }

  return payload.find({
    collection: 'businesses',
    where,
    locale,
    depth: 1,
    page,
    limit: perPage,
    // Paying listings first, then alphabetical. Tier ranking lives in
    // packages/core; this is the crude version until the list page grows
    // real relevance sorting.
    sort: ['-tier', 'name'],
    overrideAccess: false,
  })
}

/** Slugs for static generation. Published only, because that is all this returns. */
export async function findAllListingSlugs() {
  const payload = await client()
  const result = await payload.find({
    collection: 'businesses',
    limit: 1000,
    depth: 0,
    pagination: false,
    overrideAccess: false,
  })
  return result.docs.map((doc) => doc.slug).filter((slug): slug is string => Boolean(slug))
}
