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

/**
 * How many listings each governorate holds, for the chips above the grid.
 *
 * # The problem this solves
 *
 * The governorate row offered eight identical-looking choices, six of which
 * returned nothing. A reader tapped Beirut, got "No places found", and had no
 * way to have known - so the row read as broken rather than as empty. A number
 * beside each label turns a dead end into a decision made before the tap.
 *
 * # Scoped to the section, deliberately not to every filter
 *
 * The count answers "how many Stay listings are in Beirut", not "how many
 * survive all five of your current filters". That is a real limitation: with a
 * price band applied, a chip reading 12 can still yield 3.
 *
 * It is the right trade anyway. A zero is never wrong - a governorate with no
 * listings in this section has none under any additional filter either - so the
 * dead end that prompted this is still prevented. And the alternative is
 * recomputing eight counts against the full filter set on every view, including
 * the amenity intersection that already costs one query per amenity. That would
 * make the cheap common case pay for the rare one.
 *
 * # One query, tallied here
 *
 * Eight `count` queries would be eight round trips to Frankfurt. This reads the
 * governorate of every published listing in the section once and counts them in
 * memory, which is a single trip.
 *
 * The ceiling is the same one `findAllListingSlugs` has: at some thousands of
 * listings, fetching every row to count them stops being sensible and this
 * becomes a `GROUP BY`. Nowhere near that, and the fix is a query rather than a
 * redesign.
 */
export async function countByGovernorate({
  locale,
  category,
  subcategory,
}: {
  locale: Locale
  category?: string
  subcategory?: string
}): Promise<Record<string, number>> {
  const run = async () => {
    const payload = await client()

    const where: Where = {}
    if (category) where.category = { equals: category }
    // Plural and `in`, for the reason spelled out in findListings.
    if (subcategory) where.subcategories = { in: [subcategory] }

    const result = await payload.find({
      collection: 'businesses',
      where,
      locale,
      limit: 1000,
      depth: 0,
      pagination: false,
      // Drafts are excluded by the collection's own access rule, not here.
      overrideAccess: false,
      select: { governorate: true },
    })

    const counts: Record<string, number> = {}
    for (const doc of result.docs) {
      const key = typeof doc.governorate === 'string' ? doc.governorate : null
      if (key) counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }

  /**
   * Always cacheable, unlike findListings, because the key space is bounded:
   * seven categories times fifty-one subcategories times two locales. Tagged
   * with `businesses` so publishing a listing updates the numbers on the same
   * revalidation the grid already uses - a count that disagrees with the grid
   * below it is worse than no count.
   */
  return unstable_cache(run, ['governorate-counts', locale, category ?? '', subcategory ?? ''], {
    revalidate: LISTINGS_TTL,
    tags: ['businesses'],
  })()
}

/** How many places the foot of a listing page offers. Three fills one row. */
const RELATED_COUNT = 3

/**
 * A few more places to look at, for the foot of a listing page.
 *
 * # Why this page in particular needs one
 *
 * Most readers arrive here from a printed QR code, which means they land on a
 * listing having never seen the site. Without somewhere to go next, the whole
 * visit is one page: they read it, and they leave. This is the only place the
 * directory gets offered to somebody who did not go looking for it.
 *
 * # Same section, then nearest
 *
 * Same category is the strong signal - somebody reading about a hotel is
 * choosing a hotel. Governorate breaks the tie, because a restaurant two hours
 * away is a worse suggestion than one down the road.
 *
 * It is a preference, not a filter: the top dozen of the category are fetched
 * once and the nearby ones sorted to the front. So it suggests the best-ranked
 * places, nearest first, rather than searching the whole category for the three
 * closest. One round trip, and with the catalogue in one governorate today the
 * distinction is theoretical anyway.
 *
 * Returns an empty list for a listing with no category rather than falling back
 * to anything at all. Three unrelated places under "More like this" is worse
 * than no section.
 */
export async function findRelatedListings({
  locale,
  slug,
  category,
  governorate,
}: {
  locale: Locale
  slug: string
  category?: string | null
  governorate?: string | null
}): Promise<ListingSummary[]> {
  if (!category) return []

  const run = async () => {
    const payload = await client()

    const result = await payload.find({
      collection: 'businesses',
      where: { category: { equals: category }, slug: { not_equals: slug } },
      locale,
      depth: 1,
      limit: 12,
      sort: ['-tier', 'name'],
      overrideAccess: false,
    })

    if (!governorate) return result.docs.slice(0, RELATED_COUNT)

    const near = result.docs.filter((doc) => doc.governorate === governorate)
    const far = result.docs.filter((doc) => doc.governorate !== governorate)
    return [...near, ...far].slice(0, RELATED_COUNT)
  }

  /**
   * Bounded by the catalogue: one entry per listing per locale, and the listing
   * pages that use it are prerendered anyway, so this mostly serves the ones
   * published since the last build. Tagged `businesses` like everything else
   * here, so a new listing appears in its neighbours' suggestions on the same
   * revalidation that puts it in the grid.
   */
  return unstable_cache(run, ['related', locale, category, governorate ?? '', slug], {
    revalidate: LISTINGS_TTL,
    tags: ['businesses'],
  })()
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
