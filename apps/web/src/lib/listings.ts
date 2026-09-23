import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getPayload, type Where } from 'payload'
import { dataLocale, type Locale } from '@vardenia/i18n'
import config from '../payload.config'
import type { Business } from '../payload-types'
import { PUBLISHED_SQL } from '../access'
import { rawDb } from './db'
import { FIND_EVERY_CEILING, findByIdsInOrder, findEvery } from './find-every'
import { isOpenNow, type OpeningHour } from './hours'
import { reportError } from './report'

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
    locale: dataLocale(locale),
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
  /**
   * Only places open right now, in Beirut time. Unlike every other filter this
   * is not a database clause: opening hours are structured per-day text, and the
   * answer depends on the current minute, so it is evaluated in memory with
   * isOpenNow and the query is never cached (see findListings).
   */
  openNow?: boolean
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
   * # Why Payload cannot express it
   *
   * There is no operator for it. Checked against the running database rather
   * than assumed: `all` throws ("adapter.operators[queryOperator] is not a
   * function" - the Postgres adapter does not implement it), `in` gives OR,
   * and an `and` of two `equals` on the same field returns nothing, because
   * both conditions land on one join of the amenities table and no single
   * row can be two values at once.
   *
   * So the matching ids are found first - see `idsWithEveryAmenity` - and the
   * listing query is then constrained to them, which keeps pagination and the
   * total count honest where filtering the fetched page afterwards would not.
   */
  if (amenities?.length) {
    const ids = await idsWithEveryAmenity(payload, amenities)

    // An id that cannot exist, rather than an empty `in` - Payload treats
    // that as no constraint at all and would return the whole catalogue for
    // a filter that matched nothing.
    where.id = ids.length ? { in: ids } : { equals: -1 }
  }

  return where
}

/**
 * Ids of the published listings that carry every one of `amenities`.
 *
 * # One query instead of one per amenity
 *
 * This used to run a Payload query per amenity, in sequence, each returning
 * every listing with that amenity as a whole document, and then fold the id
 * lists together in Node. Three ticks was three round trips to Frankfurt
 * carrying the full rows of every listing with a pool, then every one with a
 * sea view, to keep the few that had both.
 *
 * Now the database does the intersection: group the amenity rows by listing
 * and keep the listings with as many distinct matches as amenities asked for.
 * One round trip, ids only.
 *
 * # Access is still Payload's
 *
 * Raw SQL skips access control, so it restates the public rule as
 * `PUBLISHED_SQL` - pinned to `publishedStaffOrOwned` by a test in
 * access/index.test. That is an economy here, not the boundary: these ids only
 * narrow a `payload.find` that still runs with `overrideAccess: false`, so a
 * draft id that slipped through would still not be returned.
 *
 * # If the query fails
 *
 * The listings are the page, so a failure here should not empty it. The error
 * is reported and the intersection falls back to the per-amenity reads it
 * replaced, which are slow and correct.
 */
async function idsWithEveryAmenity(
  payload: Awaited<ReturnType<typeof client>>,
  amenities: string[],
): Promise<(number | string)[]> {
  // Distinct, because the query counts distinct matches: `has=pool,pool`
  // would otherwise need two matches from a listing that can only have one.
  const wanted = [...new Set(amenities)]

  try {
    const db = rawDb(payload)
    const businesses = `"${db.schema}"."${db.table('businesses')}"`
    const amenityRows = `"${db.schema}"."${db.table('businesses_amenities')}"`

    const { rows } = await db.pool.query(
      `select a.parent_id as id from ${amenityRows} a join ${businesses} b on b.id = a.parent_id where ${PUBLISHED_SQL} and a.value::text = any($1::text[]) group by a.parent_id having count(distinct a.value) = $2`,
      [wanted, wanted.length],
    )
    return rows.map((row) => row.id as number)
  } catch (error) {
    await reportError(error, { source: 'listings.amenity-filter', extra: { amenities: wanted } })
    return idsWithEveryAmenityThroughPayload(payload, wanted)
  }
}

/** The per-amenity reads the query above replaced, kept as its fallback. */
async function idsWithEveryAmenityThroughPayload(
  payload: Awaited<ReturnType<typeof client>>,
  amenities: string[],
): Promise<(number | string)[]> {
  // Asserted rather than annotated, or TypeScript narrows it to `null` for good
  // at the initialiser and types the fold below as operating on `never`.
  let intersection = null as Set<string> | null
  const byKey = new Map<string, number | string>()

  for (const slug of amenities) {
    // `slug` is selected only because `id` cannot be - it always comes back -
    // and selecting nothing would return whole documents.
    const matching = await findEvery<{ id: number | string }>(payload, {
      collection: 'businesses',
      where: { amenities: { in: [slug] } },
      depth: 0,
      overrideAccess: false,
      select: { slug: true },
    })

    const ids = new Set<string>()
    for (const doc of matching.docs) {
      ids.add(String(doc.id))
      byKey.set(String(doc.id), doc.id)
    }
    intersection =
      intersection === null ? ids : new Set([...intersection].filter((id) => ids.has(id)))

    if (intersection.size === 0) break
  }

  return [...(intersection ?? [])].map((key) => byKey.get(key) as number | string)
}

type OpenNowCandidate = Pick<Business, 'id' | 'openingHours'>
type OpenNowFilters = { category?: string; subcategory?: string; governorate?: string }

/**
 * Every listing matching `where`, with only its opening hours, in page order.
 *
 * # Every candidate, and only its hours
 *
 * This read `limit: 1000, pagination: false`, which Payload truncates without
 * saying so (see lib/find-every). Production passed 1,000 published listings,
 * so `/directory?open=1` was quietly testing the first thousand and never the
 * rest. It also fetched each of them at `depth: 1`, images joined, to read one
 * field. So the whole set is read through `findEvery` with only the hours
 * selected, and findListings loads full documents for the one page it shows.
 *
 * When this stops being cheap, a scheduled "open now" materialisation is
 * where it goes.
 */
async function readOpenNowCandidates(
  payload: Awaited<ReturnType<typeof client>>,
  where: Where,
  locale: Locale,
  filters: OpenNowFilters,
): Promise<OpenNowCandidate[]> {
  const candidates = await findEvery<OpenNowCandidate>(payload, {
    collection: 'businesses',
    where,
    locale: dataLocale(locale),
    depth: 0,
    sort: ['-tier', 'name'],
    overrideAccess: false,
    select: { openingHours: true },
  })

  /**
   * A reader is looking at this list, so it is not worth a 500. It is still
   * wrong, and the one thing it must not do is be wrong silently - so staff
   * hear about it, and the fix on that day is the materialisation above rather
   * than a bigger ceiling.
   */
  if (!candidates.complete) {
    await reportError(
      new Error(`open-now stopped after ${FIND_EVERY_CEILING} candidate listings`),
      { source: 'listings.open-now-incomplete', level: 'warning', extra: { ...filters } },
    )
  }

  return candidates.docs
}

/**
 * The open-now candidates for a section, region or kind of place, cached.
 *
 * Every `?open=1` view used to read every matching listing's hours from
 * Frankfurt on every request - three paged reads for the whole directory -
 * because the answer depends on the minute and so could not be cached. But
 * only the answer does. Which listings match and when they open changes when
 * somebody edits a listing, and that already clears the `businesses` tag.
 *
 * So the set is cached for the hour like the grid it sits in, and the clock is
 * applied to it per request by findListings. A cached set cannot show a closed
 * place as open; the worst a stale one could do is miss an edit to someone's
 * hours, and the tag means it does not.
 *
 * # The same key space as the grid
 *
 * Category, kind and region only - the filters findListings already caches -
 * because those are bounded. District, price and amenities multiply the keys
 * past usefulness, and those views read directly, as the grid does.
 *
 * Keyed on locale, though no hours are translated: the set is in page order,
 * and page order sorts on `name`, which is.
 *
 * # Size
 *
 * Measured in September 2026: 37KB for the whole directory, because only 2 of
 * 1,277 published listings had any hours. A day's row is about 100 bytes, so a
 * full week on every listing would make the directory-wide entry about 0.9MB -
 * inside Next's 2MB limit, with less room than the search candidates have.
 * Split shifts are what would push it over. If an entry does exceed the limit,
 * Next declines to cache it and says so on the console, and that view reads
 * directly, as every open-now view did before this.
 */
const openNowCandidates = ({ locale, ...filters }: OpenNowFilters & { locale: Locale }) =>
  unstable_cache(
    async () => {
      const payload = await client()
      const where = await buildListingWhere(payload, filters)
      return readOpenNowCandidates(payload, where, locale, filters)
    },
    [
      'open-now-candidates',
      locale,
      filters.category ?? '',
      filters.subcategory ?? '',
      filters.governorate ?? '',
    ],
    { revalidate: LISTINGS_TTL, tags: ['businesses'] },
  )()

export async function findListings({
  locale,
  category,
  subcategory,
  governorate,
  district,
  priceRange,
  amenities,
  openNow,
  page = 1,
  perPage = 24,
}: ListingQuery) {
  const run = async () => {
    const payload = await client()

    const where = await buildListingWhere(payload, {
      category,
      subcategory,
      governorate,
      district,
      priceRange,
      amenities,
    })

    if (openNow) {
      /**
       * Open-now is evaluated against the live minute in Beirut, so the answer
       * is never cached (see `cacheable` below) and the whole matching set is
       * filtered here rather than page by page - filtering one page would leave
       * short pages and a wrong total. Then the open set is paginated in
       * memory, so the count and the page controls stay honest.
       *
       * What is cached is the question: which listings match, and what their
       * hours are. See `openNowCandidates`. The clock is read here, per request,
       * so a cached set can never show a closed place as open.
       */
      const filters = { category, subcategory, governorate }
      const candidates =
        !district && !priceRange && !amenities?.length
          ? await openNowCandidates({ locale, ...filters })
          : await readOpenNowCandidates(payload, where, locale, filters)

      const open = candidates.filter(
        (doc) => isOpenNow(doc.openingHours as OpeningHour[] | null | undefined) === true,
      )
      const totalDocs = open.length
      const totalPages = Math.max(1, Math.ceil(totalDocs / perPage))
      const current = Math.min(Math.max(1, page), totalPages)
      const start = (current - 1) * perPage

      const docs = await findByIdsInOrder<Business>(
        payload,
        open.slice(start, start + perPage).map((doc) => doc.id),
        {
          collection: 'businesses',
          locale: dataLocale(locale),
          depth: 1,
          overrideAccess: false,
        },
      )

      return {
        docs,
        totalDocs,
        totalPages,
        page: current,
        limit: perPage,
        hasNextPage: current < totalPages,
        hasPrevPage: current > 1,
        pagingCounter: start + 1,
        nextPage: current < totalPages ? current + 1 : null,
        prevPage: current > 1 ? current - 1 : null,
      }
    }

    return payload.find({
      collection: 'businesses',
      where,
      locale: dataLocale(locale),
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
  // openNow is excluded too: its answer changes by the minute, so caching it for
  // an hour would show a closed place as open for most of that hour.
  const cacheable = !district && !priceRange && !amenities?.length && !openNow

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
 * Run a grouped count over published listings and return it as a map.
 *
 * `build` receives the quoted table names and returns the query. Every value in
 * it is a bound parameter; the only interpolated text is the table names, which
 * come from lib/db rather than from a caller, and `PUBLISHED_SQL`.
 *
 * Everything else in this file reads through Payload with `overrideAccess:
 * false`, so Payload applies the access rule. These cannot - Payload has no
 * grouping - so they restate it, as `PUBLISHED_SQL` from access/index, where it
 * sits beside the rule and is pinned to it by a test.
 *
 * # What the GROUP BY costs
 *
 * These were the largest reads in the app: every published listing in a
 * section, fetched to be counted in Node. Now the database returns eight rows.
 * The price is reaching past Payload, into table and column names that are not
 * its public API, and lib/db is where that trade is argued and guarded.
 *
 * # It returns null rather than throwing
 *
 * A count decorates a page; it must not take one down. If the schema moved
 * under this - a renamed column, a Payload upgrade that changed the adapter -
 * the error is reported and the caller gets `null`, which both ListingFilters
 * and SubcategoryTiles render as "not counted". Reported as an error rather
 * than a warning, because unlike a ceiling it means something is broken.
 */
async function countPublished(
  source: string,
  build: (tables: { businesses: string; subcategories: string }) => {
    sql: string
    values: unknown[]
  },
  extra: Record<string, unknown>,
): Promise<Record<string, number> | null> {
  try {
    const db = rawDb(await client())
    const { sql, values } = build({
      businesses: `"${db.schema}"."${db.table('businesses')}"`,
      subcategories: `"${db.schema}"."${db.table('businesses_subcategories')}"`,
    })
    const { rows } = await db.pool.query(sql, values)

    const counts: Record<string, number> = {}
    for (const row of rows) {
      if (typeof row.key === 'string') counts[row.key] = Number(row.n)
    }
    return counts
  } catch (error) {
    await reportError(error, { source, extra })
    return null
  }
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
 * # Counted by the database
 *
 * This fetched the governorate of every published listing in the section and
 * tallied them in Node - 749 rows over the wire for Eat & Drink, 1,277 for the
 * directory, to produce eight numbers. It is now a `GROUP BY` that returns the
 * eight numbers. See `countPublished` for what that costs in exchange.
 *
 * # Not per locale
 *
 * Governorate, category, subcategories and `_status` are none of them
 * localised, so the numbers are the same in every language. The cache used to
 * be keyed on locale anyway, holding ten identical copies of each count; the
 * `locale` argument went with it.
 */
export async function countByGovernorate({
  category,
  subcategory,
}: {
  category?: string
  subcategory?: string
}): Promise<Record<string, number> | undefined> {
  const run = () =>
    countPublished(
      'listings.governorate-counts',
      ({ businesses, subcategories }) => {
        const values: unknown[] = []
        const where = [PUBLISHED_SQL, 'b.governorate is not null']

        if (category) {
          values.push(category)
          where.push(`b.category::text = $${values.length}`)
        }
        // A listing may carry several subcategories, so this is a membership
        // test rather than a join - a join would count it once per match.
        if (subcategory) {
          values.push(subcategory)
          where.push(
            `exists (select 1 from ${subcategories} s where s.parent_id = b.id and s.value::text = $${values.length})`,
          )
        }

        return {
          sql: `select b.governorate::text as key, count(*)::int as n from ${businesses} b where ${where.join(' and ')} group by 1`,
          values,
        }
      },
      { category, subcategory },
    )

  /**
   * Always cacheable, unlike findListings, because the key space is bounded:
   * seven categories times fifty-one subcategories. Tagged with `businesses` so
   * publishing a listing updates the numbers on the same revalidation the grid
   * already uses - a count that disagrees with the grid below it is worse than
   * no count.
   */
  const counts = await unstable_cache(
    run,
    ['governorate-counts', category ?? '', subcategory ?? ''],
    { revalidate: LISTINGS_TTL, tags: ['businesses'] },
  )()

  // `null` in the cache, because it serialises; `undefined` out, because that
  // is what ListingFilters reads as "not counted" and renders as no number.
  return counts ?? undefined
}

/**
 * The listings a venue has paid to have shown.
 *
 * This is the visible half of what `featured` buys - the home page draws a band
 * of these above everything else. The other half needs no query at all: every
 * listing grid already sorts on `-tier`, so a paid listing rises to the top of
 * its section without anything here.
 *
 * # Why it is its own query rather than a filter on the homepage grid
 *
 * The band has to be able to disappear. A "Featured" heading over an empty row
 * advertises that nobody has bought anything, and for most of the first year
 * there will be nothing in it - so the page asks for these separately and drops
 * the whole section when the answer is empty, the way the magazine band already
 * does. Folding it into the main grid would mean either showing free listings
 * under a paid heading, or a heading with nothing beneath it.
 */
export async function findFeaturedListings({
  locale,
  limit = 6,
}: {
  locale: Locale
  limit?: number
}): Promise<ListingSummary[]> {
  const run = async (): Promise<ListingSummary[]> => {
    const payload = await client()

    const result = await payload.find({
      collection: 'businesses',
      where: { tier: { equals: 'featured' } },
      locale: dataLocale(locale),
      depth: 1,
      limit,
      pagination: false,
      // Drafts are excluded by the collection's own access rule, not here.
      overrideAccess: false,
      sort: ['-tier', 'name'],
    })

    return result.docs as ListingSummary[]
  }

  return unstable_cache(run, ['featured-listings', locale, String(limit)], {
    revalidate: LISTINGS_TTL,
    tags: ['businesses'],
  })()
}

/**
 * How many listings sit under each subcategory of one section.
 *
 * The section page opens on a row of subcategory tiles rather than on listings,
 * and a tile that leads to nothing is the dead end this number prevents: a
 * reader who picks "Private Villas" and lands on an empty page has been sent
 * there by us. With the count on the tile the choice is informed before it is
 * made, and an empty subcategory is shown with a nought rather than as a link.
 *
 * A `GROUP BY` over the subcategory table, like `countByGovernorate` above. It
 * takes no filter state, deliberately - these are the counts for the section as
 * a whole, which is the only moment the tiles are shown - and no locale, for
 * the same reason as above.
 *
 * `null` when the count fails, and it matters more here than on a chip: the
 * tiles decide from these counts which kinds of place are links at all, so a
 * subcategory wrongly counted as nought would become unreachable. `null` tells
 * SubcategoryTiles it does not know, and it links every tile.
 */
export async function countBySubcategory({
  category,
}: {
  category: string
}): Promise<Record<string, number> | null> {
  const run = () =>
    countPublished(
      'listings.subcategory-counts',
      ({ businesses, subcategories }) => ({
        /**
         * `count(distinct b.id)`, not `count(*)`: a listing is one listing, and
         * should not count twice under a kind of place it somehow carries
         * twice. The in-memory tally it replaced did count it twice. No row in
         * either database carries a duplicate, so no number changes today.
         */
        sql: `select s.value::text as key, count(distinct b.id)::int as n from ${businesses} b join ${subcategories} s on s.parent_id = b.id where ${PUBLISHED_SQL} and b.category::text = $1 group by 1`,
        values: [category],
      }),
      { category },
    )

  return unstable_cache(run, ['subcategory-counts', category], {
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
      locale: dataLocale(locale),
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

/**
 * Every published slug, for the sitemap and for static generation.
 *
 * # This was missing 277 listings
 *
 * It read `limit: 1000, pagination: false`, which Payload truncates without
 * saying so - see lib/find-every. Production passed a thousand published
 * listings, so from then on the sitemap and `generateStaticParams` both carried
 * the first thousand and nothing after. Every listing past that point had a
 * printed code sending readers to it and no sitemap entry telling a search
 * engine it existed.
 *
 * Only `slug` is selected. It was reading whole documents to keep one field.
 *
 * # It throws rather than returning what it has
 *
 * Unlike the counts, there is no honest partial answer here: a sitemap missing
 * listings is precisely the bug this replaced, and nothing downstream could
 * tell. At build time the throw fails a deploy and the previous one stays live
 * - loud, and harmless to readers. The sitemap also rebuilds hourly at runtime,
 * where a throw leaves the last good sitemap in place; see app/sitemap.
 *
 * The ceiling also lines up with a real limit rather than an arbitrary one. A
 * sitemap file holds at most 50,000 URLs, so the day this throws is the day the
 * sitemap has to become an index of several files anyway.
 */
export async function findAllListingSlugs() {
  const payload = await client()
  const result = await findEvery<Pick<Business, 'id' | 'slug'>>(payload, {
    collection: 'businesses',
    depth: 0,
    overrideAccess: false,
    select: { slug: true },
  })

  if (!result.complete) {
    throw new Error(
      `findAllListingSlugs: stopped after ${FIND_EVERY_CEILING} listings. ` +
        'Split the sitemap into an index rather than raising the ceiling.',
    )
  }

  return result.docs.map((doc) => doc.slug).filter((slug): slug is string => Boolean(slug))
}
