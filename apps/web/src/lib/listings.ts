import { cache } from 'react'
import { unstable_cache } from 'next/cache'
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
  /**
   * One of the category's own children, e.g. `boutique-hotels` under
   * `hospitality`. The section pages filter on this, which is why fifty-one
   * subcategories need no templates of their own.
   */
  subcategory?: string
  governorate?: string
  /** One of the selected governorate's own districts. */
  district?: string
  /** A stored band, '1' to '4'. */
  priceRange?: string
  /** Every one of these, not any. See the query below. */
  amenities?: string[]
  page?: number
  perPage?: number
}

/**
 * How long a directory result stays cached. Matches the 60s on every other
 * public page, so the whole site has one staleness story rather than several.
 */
const LISTINGS_TTL = 60

/**
 * Cached across requests, and this is the one that mattered most.
 *
 * /directory reads `searchParams`, which makes it impossible to prerender the
 * results the way every other page is prerendered. Without a cache of its own
 * that meant a full round trip to the database on every single view. Measured
 * against production with the real Supabase connection:
 *
 *     homepage         ~6ms      prerendered
 *     magazine         ~5ms      prerendered, ISR
 *     listing detail   ~5ms      prerendered, ISR
 *     /directory     ~350ms      uncached, every request
 *
 * The directory is the page a reader lands on from a printed QR code and the
 * one they browse, so it was the slowest page for the most common journey.
 *
 * The key covers every input that changes the result. Filters are drawn from a
 * fixed taxonomy and a fixed list of governorates, so the number of distinct
 * keys is bounded and small - this cannot grow without limit from crafted query
 * strings, because anything not in the taxonomy simply returns nothing and
 * caches that.
 *
 * Tagged `businesses` so a future `revalidateTag` on publish can clear it
 * immediately rather than waiting out the window.
 */
export async function findListings({
  locale,
  category,
  subcategory,
  governorate,
  district,
  priceRange,
  amenities,
  page = 1,
  perPage = 24,
}: ListingQuery) {
  const run = async () => {
    {
      const payload = await client()

      const where: Where = {}
      if (category) where.category = { equals: category }
      /**
       * `subcategories`, plural, and `in` rather than `equals`.
       *
       * The field is `hasMany`, so a listing carries a list and the query asks
       * whether the wanted slug is in it. The singular name is not merely wrong,
       * it throws - "the following path cannot be queried" - and it threw from
       * inside the Suspense boundary, so the page still answered 200 with the
       * failure buried in the streamed body. Worth remembering: a 200 from a
       * streamed route says nothing about whether the query ran.
       */
      if (subcategory) where.subcategories = { in: [subcategory] }
      if (governorate) where.governorate = { equals: governorate }
      if (district) where.district = { equals: district }
      if (priceRange) where.priceRange = { equals: priceRange }

      /**
       * Every amenity, not any of them.
       *
       * A reader who ticks "wheelchair accessible" and "pool" wants both. `in`
       * is an OR, so the list would grow with each tick - the opposite of what a
       * filter does, and for the accessibility one in particular a list that
       * grows as you narrow it is actively misleading.
       *
       * # Why this is several queries and not one clause
       *
       * There is no operator for it. Checked against the running database rather
       * than assumed: `all` throws ("adapter.operators[queryOperator] is not a
       * function" - the Postgres adapter does not implement it), `in` gives OR,
       * and an `and` of two `equals` on the same field returns nothing, because
       * both conditions land on one join of the amenities table and no single
       * row can be two values at once.
       *
       * So the intersection is done here: the ids matching each amenity, folded
       * together. Correct, and it keeps pagination and the total count honest,
       * which filtering the fetched page afterwards would not.
       *
       * The ceiling: this reads every matching id per amenity, so at tens of
       * thousands of listings it stops being cheap. The fix then is a
       * denormalised text[] column with a GIN index and a `@>` containment
       * query - a migration, not a rewrite. Nowhere near that yet.
       */
      if (amenities?.length) {
        let intersection: (number | string)[] | null = null

        for (const slug of amenities) {
          const matching = await payload.find({
            collection: 'businesses',
            where: { amenities: { in: [slug] } },
            depth: 0,
            pagination: false,
            overrideAccess: false,
          })

          const ids: (number | string)[] = matching.docs.map((doc) => doc.id)
          intersection = intersection === null ? ids : intersection.filter((id) => ids.includes(id))

          if (intersection.length === 0) break
        }

        // An id that cannot exist, rather than an empty `in` - Payload treats
        // that as no constraint at all and would return the whole catalogue for
        // a filter that matched nothing.
        where.id = intersection?.length ? { in: intersection } : { equals: -1 }
      }

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
  }

  /**
   * Cached only while the number of possible keys stays small.
   *
   * The cache exists because `/directory` cost a 350ms round trip on every view.
   * That is worth paying for on the handful of views most people actually see -
   * a section, optionally narrowed by kind or by governorate.
   *
   * Past that the arithmetic turns: seven categories times fifty-one
   * subcategories times eight governorates times twenty-eight districts times
   * four price bands times any combination of sixteen amenities is not a bounded
   * set in any useful sense. Caching it would fill the store with entries nobody
   * asks for twice, and evict the ones everybody asks for constantly.
   *
   * So a deeply filtered view queries directly. It is rarer, it is a person
   * genuinely narrowing something down, and 350ms is a fair price for it.
   */
  const cacheable = !district && !priceRange && !amenities?.length

  if (!cacheable) return run()

  return unstable_cache(
    run,
    [
      'listings',
      locale,
      category ?? '',
      subcategory ?? '',
      governorate ?? '',
      String(page),
      String(perPage),
    ],
    { revalidate: LISTINGS_TTL, tags: ['businesses'] },
  )()
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
