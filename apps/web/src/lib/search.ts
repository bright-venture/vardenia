import { getPayload, type Where } from 'payload'
import type { Locale } from '@vardenia/i18n'
import config from '../payload.config'

/**
 * Site search, across listings and editorial.
 *
 * # What this is not
 *
 * It is not relevance ranking. Postgres `LIKE` over a handful of columns, with
 * listings ordered by tier and articles by date - the same order those pages use
 * already. At the size of this catalogue that is honest and adequate; a query
 * that matches forty listings is not one anybody is running yet.
 *
 * When it stops being adequate the answer is Postgres full text search with a
 * `tsvector` column and a GIN index, which is a migration rather than a rewrite.
 * Worth doing when a search returns more than a screen, not before.
 *
 * # Both collections, one query each
 *
 * A reader searching "Byblos" might mean the town, a hotel, or the article about
 * it. Splitting the results by type and showing both is more useful than
 * guessing which they meant, and avoids inventing a scoring rule to interleave
 * two things that have no common scale.
 *
 * # Access control is not bypassed
 *
 * `overrideAccess: false`, like every other public read. Drafts are filtered out
 * in the database, so an unpublished listing cannot be found by guessing at its
 * name - which is exactly the kind of hole a search box opens if it is written
 * as an admin query with a filter bolted on.
 */

/** Longer than a database column will ever usefully match, short enough to bound the query. */
const MAX_QUERY = 80

/** Enough to be a word. One letter matches most of the catalogue and means nothing. */
const MIN_QUERY = 2

export interface SearchQuery {
  locale: Locale
  q: string
  limit?: number
}

/**
 * The query as we will actually use it, or null if there is nothing to search.
 *
 * `%` and `_` are wildcards in SQL `LIKE`. Payload parameterises the value so
 * they are not an injection risk, but left in they quietly turn a search for
 * "100%" into a match on everything - so they are stripped rather than escaped,
 * because nobody is searching for a literal underscore.
 */
export function normaliseQuery(raw: string | null | undefined): string | null {
  if (!raw) return null

  const cleaned = raw.replace(/[%_]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY)

  return cleaned.length >= MIN_QUERY ? cleaned : null
}

export interface SearchResults {
  /** The cleaned query, or null when there was nothing worth running. */
  query: string | null
  listings: Awaited<ReturnType<typeof searchListings>>
  articles: Awaited<ReturnType<typeof searchArticles>>
  total: number
}

const client = async () => getPayload({ config })

/** Listings whose name or tagline contains the query. */
async function searchListings(locale: Locale, q: string, limit: number) {
  const payload = await client()
  const where: Where = {
    or: [{ name: { like: q } }, { tagline: { like: q } }],
  }

  const result = await payload.find({
    collection: 'businesses',
    where,
    locale,
    depth: 1,
    limit,
    // Paying listings first, then alphabetical - the same order the directory
    // uses, so a listing does not change rank depending on how you arrived.
    sort: ['-tier', 'name'],
    overrideAccess: false,
  })

  return result
}

/**
 * Articles whose title or excerpt contains the query.
 *
 * The body is deliberately not searched. It is Lexical rich text stored as
 * JSON, so `like` over it matches the markup as readily as the prose - a search
 * for "text" would return every article ever written. Full text search over an
 * extracted plain-text column is the fix, and it belongs with the migration
 * described above.
 */
async function searchArticles(locale: Locale, q: string, limit: number) {
  const payload = await client()
  const where: Where = {
    or: [{ title: { like: q } }, { excerpt: { like: q } }],
  }

  return payload.find({
    collection: 'articles',
    where,
    locale,
    depth: 1,
    limit,
    sort: ['-publishedAt', '-createdAt'],
    overrideAccess: false,
  })
}

export async function search({ locale, q, limit = 12 }: SearchQuery): Promise<SearchResults> {
  const query = normaliseQuery(q)

  if (!query) {
    const empty = { docs: [], totalDocs: 0 } as never
    return { query: null, listings: empty, articles: empty, total: 0 }
  }

  // Both at once: they are independent queries and the page needs both before
  // it can render anything.
  const [listings, articles] = await Promise.all([
    searchListings(locale, query, limit),
    searchArticles(locale, query, limit),
  ])

  return {
    query,
    listings,
    articles,
    total: listings.totalDocs + articles.totalDocs,
  }
}
