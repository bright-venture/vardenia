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
 * How long a directory result stays cached.
 *
 * # This number governs far more than it looks like it does
 *
 * It was sixty seconds, and it silently set the ISR window for every page that
 * reads a listing. Next takes the *minimum* of a page's own `revalidate` and
 * the shortest cache entry that page consumes, so `export const revalidate =
 * 3600` on directory/[slug] and on the homepage were both being clamped back to
 * sixty by this constant. The build manifest is where that shows:
 *
 *   before   /en 60   /en/directory/beit-douma 60   (both declare 3600)
 *   after    /en 3600 /en/directory/beit-douma 3600
 *
 * So the comment that used to sit here - "matches the 60s on every other public
 * page" - had cause and effect backwards. Nothing else chose sixty seconds.
 * This did, for everything.
 *
 * # An hour is not staler than a minute here
 *
 * Every entry below is tagged `businesses`, and publishing a listing fires
 * `revalidateTag('businesses')` from hooks/revalidateListings. An edit clears
 * these immediately whatever this number says. The window only decides how
 * often an unchanged page is rebuilt from scratch - and a rebuild means loading
 * payload.config, measured at 4,158ms and 337MB.
 *
 * At sixty seconds the homepage alone was entitled to 1,440 rebuilds a day to
 * produce an identical page. That is the cost this removes; freshness was never
 * what the sixty seconds was buying.
 */
const LISTINGS_TTL = 60 * 60

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
 *
 * # No composite index, and that is measured rather than assumed
 *
 * Every column filtered on here is indexed on its own, and a filtered read
 * touches three at once, so a composite on `(category, governorate, _status)`
 * is the obvious next move. Against production on 2026-09-03:
 *
 *   Index Scan using businesses_category_idx  (actual time=0.136..0.588 rows=62)
 *     Filter: (_status = 'published' AND governorate = 'mount-lebanon')
 *     Rows Removed by Filter: 84
 *   Planning Time: 2.752 ms
 *   Execution Time: 0.755 ms
 *
 * Planning already costs three and a half times what execution does, and each
 * extra index makes planning slower - so a composite would be a net loss at
 * this size. `Rows Removed by Filter` scales with category size, so re-run that
 * EXPLAIN when execution time overtakes planning time. That is the trigger, not
 * a row count somebody picked.
 */
/**
 * Translate the public filter set into a Payload `where`.
 *
 * Extracted so the grid, the map and anything else that lists places apply
 * identical filters. A filtered map that quietly disagreed with the list beside
 * it - one amenity handled differently, say - would be worse than no map at all,
 * and the amenity intersection below is subtle enough that a second hand-written
 * copy would drift from this one within a release or two.
 */
async function buildListingWhere(
  payload: Awaited<ReturnType<typeof client>>,
  {
    category,
    subcategory,
    governorate,
    district,
    priceRange,
    amenities,
  }: Pick<
    ListingQuery,
    'category' | 'subcategory' | 'governorate' | 'district' | 'priceRange' | 'amenities'
  >,
): Promise<Where> {
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

  return where
}

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

      const where = await buildListingWhere(payload, {
        category,
        subcategory,
        governorate,
        district,
        priceRange,
        amenities,
      })

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

/** One pin. Only the fields a marker and its popup actually use. */
export interface MapPoint {
  slug: string
  name: string
  /** Payload stores a point as `[lng, lat]`; these are pulled apart on read. */
  lat: number
  lng: number
  tier: string
  category: string | null
  priceRange: string | null
  governorate: string | null
  district: string | null
}

/**
 * Every place matching the current filters that has coordinates, for the map.
 *
 * # Not `findListings` with a big page size
 *
 * The map needs one thing the grid does not: all of the matches at once, because
 * a pin that only appears on page two of a paginated fetch is a pin missing from
 * the map. And it needs far less of each - a marker is a dot and a name, not a
 * hero image and a rich-text body - so this selects six columns and reads at
 * `depth: 0` rather than pulling whole documents the way the grid does at
 * `depth: 1`. Running the grid query with `perPage: 1000` would fetch hundreds of
 * full listings to render hundreds of dots.
 *
 * # Only places with a location
 *
 * `location` is optional on a listing, and much of the imported catalogue has
 * none yet, so the filter is part of the query rather than a courtesy: a listing
 * with no coordinates cannot be a pin, and the caller is told how many were
 * dropped so the count beside the map stays honest.
 *
 * The 1000 ceiling is the one `countByGovernorate` and `findAllListingSlugs`
 * share: fine at the current few hundred, and the day it is not, the fix is a
 * bounding-box clause (`location` `within` the viewport) rather than a redesign -
 * which is also what turns this into a live "search this area" map later.
 */
export async function findListingsForMap({
  locale,
  category,
  subcategory,
  governorate,
  district,
  priceRange,
  amenities,
}: Omit<ListingQuery, 'page' | 'perPage'>): Promise<MapPoint[]> {
  const run = async (): Promise<MapPoint[]> => {
    const payload = await client()

    const where = await buildListingWhere(payload, {
      category,
      subcategory,
      governorate,
      district,
      priceRange,
      amenities,
    })
    // A pin needs a point. Narrow at the database rather than fetching the whole
    // catalogue and discarding the coordinateless half here.
    where.location = { exists: true }

    const result = await payload.find({
      collection: 'businesses',
      where,
      locale,
      depth: 0,
      limit: 1000,
      pagination: false,
      overrideAccess: false,
      sort: ['-tier', 'name'],
      select: {
        slug: true,
        name: true,
        location: true,
        tier: true,
        category: true,
        priceRange: true,
        governorate: true,
        district: true,
      },
    })

    const points: MapPoint[] = []
    for (const doc of result.docs) {
      // `exists: true` should have guaranteed this, but a point is a pair of
      // numbers and a marker placed at a half-null coordinate lands in the sea
      // off West Africa rather than failing - so the shape is checked, not trusted.
      const loc = doc.location
      if (!Array.isArray(loc)) continue
      const [lng, lat] = loc as [unknown, unknown]
      if (typeof lat !== 'number' || typeof lng !== 'number') continue

      points.push({
        slug: typeof doc.slug === 'string' ? doc.slug : '',
        name: typeof doc.name === 'string' ? doc.name : '',
        lat,
        lng,
        tier: typeof doc.tier === 'string' ? doc.tier : 'free',
        category: typeof doc.category === 'string' ? doc.category : null,
        priceRange: doc.priceRange == null ? null : String(doc.priceRange),
        governorate: typeof doc.governorate === 'string' ? doc.governorate : null,
        district: typeof doc.district === 'string' ? doc.district : null,
      })
    }
    return points
  }

  // Cached on the same rule and tag as the grid, so the common views - a section,
  // optionally by governorate - are a single Frankfurt round trip, and a
  // published edit clears both on the one `businesses` revalidation.
  const cacheable = !district && !priceRange && !amenities?.length
  if (!cacheable) return run()

  return unstable_cache(
    run,
    ['listings-map', locale, category ?? '', subcategory ?? '', governorate ?? ''],
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

/**
 * How many printed codes exist, for the homepage masthead's third figure.
 *
 * The masthead deliberately showed two stats and refused a third, because the
 * commissioned design's "printed codes" number was invented and every other
 * figure on the site is measured. The redesign wants the third stat, so this
 * makes it real rather than fabricated: a count of the qr-codes collection.
 *
 * `overrideAccess: true` because a count is an aggregate, not a document - it
 * leaks no code and no listing - and the anonymous read rules on the collection
 * would otherwise return zero. Cached on the same hour the rest of the homepage
 * is, so it is one extra round trip to Frankfurt per hour, not per view.
 */
export async function countCodes(): Promise<number> {
  const run = async () => {
    const payload = await client()
    const { totalDocs } = await payload.count({ collection: 'qr-codes', overrideAccess: true })
    return totalDocs
  }

  return unstable_cache(run, ['code-count'], { revalidate: LISTINGS_TTL, tags: ['qr-codes'] })()
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
 * It is a preference, not a filter: a pool of the category's best-ranked places
 * is fetched and the nearby ones sorted to the front. So it suggests the
 * best-ranked places, nearest first, rather than searching the whole category
 * for the three closest. With the catalogue in two districts today the
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

  // The query is shared by every listing in the category; only the sorting
  // below is per-listing, and that is arithmetic rather than a round trip.
  const pool = (await categoryPool(category, locale)).filter((doc) => doc.slug !== slug)

  if (!governorate) return pool.slice(0, RELATED_COUNT)

  const near = pool.filter((doc) => doc.governorate === governorate)
  const far = pool.filter((doc) => doc.governorate !== governorate)
  return [...near, ...far].slice(0, RELATED_COUNT)
}

/**
 * How many of a category to hold in the pool the suggestions are drawn from.
 *
 * Big enough that excluding the listing being viewed, and preferring its
 * governorate, still leaves three worth showing. Small enough that the whole
 * thing is one page of results.
 */
const POOL_SIZE = 24

/**
 * The best-ranked listings in one category, cached per category and locale.
 *
 * # This exists because of what the first version cost at build time
 *
 * `findRelatedListings` used to run the query itself, with the slug in its cache
 * key. That is correct and it meant one uncached query per listing per locale:
 * 616 round trips to Frankfurt on every production build, on top of the 616 the
 * pages themselves make. It roughly doubled the database work a deploy does, and
 * it was mine.
 *
 * The realisation is that every listing in a category wants the same query. Only
 * the ordering afterwards differs, and that is done in memory. Seven categories
 * times two locales is fourteen distinct keys, whatever the catalogue grows to.
 *
 * # Fourteen keys is not fourteen queries, and the difference is worth knowing
 *
 * Measured by logging every real query through a build: ten listing pages
 * produced nine queries, not six. `unstable_cache` deduplicates by writing a
 * result and serving it to later callers, and Next renders pages across parallel
 * workers - so several can miss the same key before any of them has written it.
 * Two pages sharing a key sometimes collapse to one query and sometimes do not.
 *
 * That race is bounded by the number of workers, not by the number of pages. At
 * 308 listings each key is wanted by roughly a hundred pages, so all but the
 * first handful are served from cache. Tens of queries rather than 616, which is
 * the point - but do not expect exactly fourteen.
 *
 * # Why the self-exclusion moved out of the query
 *
 * `where: { slug: { not_equals: slug } }` is what forced the key to be
 * per-listing. Dropping it makes the query shareable, and the caller filters
 * itself out of the pool instead. The pool is larger than the old limit of
 * twelve to pay for the one row that is now spent on the listing itself.
 *
 * Tagged `businesses`, so a newly published listing appears in its neighbours'
 * suggestions on the same revalidation that puts it in the grid.
 */
async function categoryPool(category: string, locale: Locale): Promise<ListingSummary[]> {
  const run = async () => {
    const payload = await client()

    const result = await payload.find({
      collection: 'businesses',
      where: { category: { equals: category } },
      locale,
      depth: 1,
      limit: POOL_SIZE,
      sort: ['-tier', 'name'],
      overrideAccess: false,
    })

    return result.docs
  }

  return unstable_cache(run, ['category-pool', locale, category], {
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
