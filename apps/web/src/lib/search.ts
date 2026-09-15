import { getPayload } from 'payload'
import { dataLocale, type Locale } from '@vardenia/i18n'
import config from '../payload.config'
import { SIMILARITY_THRESHOLD, bestFieldScore } from './search-text'

/**
 * Site search, across listings and editorial.
 *
 * # Fuzzy, and why in memory
 *
 * This was a Postgres `LIKE` over a few columns: the query had to appear
 * verbatim, so a typo or an Arabic word voweled differently found nothing. It now
 * ranks by trigram similarity (see search-text), so "resturant" still finds the
 * restaurants and Arabic matches whatever the diacritics.
 *
 * The ranking is done in memory over the published set rather than in the
 * database. At this catalogue - a few dozen rows - that is honest and cheap, and
 * it keeps the one rule that matters most exactly where it already is: the draft
 * filter. Every fetch runs `overrideAccess: false`, so Payload returns only
 * published documents and strips staff-only fields, and search cannot surface a
 * draft by construction because it is never handed one. A raw SQL ranking would
 * have to re-implement that filter and could get it wrong.
 *
 * When a search starts returning more than a screen, the move is Postgres
 * `pg_trgm` with a GIN index, which is a change to this file alone - the scoring
 * shape and the tests around it do not change.
 *
 * # Both collections, one query each
 *
 * A reader searching "Byblos" might mean the town, a hotel, or the article about
 * it. Splitting the results by type and showing both is more useful than
 * guessing which they meant, and avoids inventing a scoring rule to interleave
 * two things that have no common scale.
 */

/** Longer than a database column will ever usefully match, short enough to bound the query. */
const MAX_QUERY = 80

/** Enough to be a word. One letter matches most of the catalogue and means nothing. */
const MIN_QUERY = 2

/**
 * How many published rows we pull in to rank. Comfortably above the catalogue,
 * so in practice this fetches everything published; it is a ceiling that keeps
 * the in-memory pass bounded rather than a page size a reader ever notices. It is
 * also the line that says when to move to `pg_trgm`: once the published set
 * approaches this, ranking in memory is the wrong tool.
 */
const CANDIDATE_CAP = 1000

export interface SearchQuery {
  locale: Locale
  q: string
  limit?: number
}

/**
 * The query as we will actually use it, or null if there is nothing to search.
 *
 * `%` and `_` are wildcards in SQL `LIKE`. The ranking no longer runs a `LIKE`,
 * but stripping them still earns its place: they are punctuation to the matcher,
 * and a search for "100%" should compare on "100" rather than drag a stray
 * wildcard through every score. Whitespace is collapsed and the whole thing is
 * bounded so nothing enormous reaches the scorer.
 */
export function normaliseQuery(raw: string | null | undefined): string | null {
  if (!raw) return null

  const cleaned = raw.replace(/[%_]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY)

  return cleaned.length >= MIN_QUERY ? cleaned : null
}

const client = async () => getPayload({ config })

/**
 * Rank a fetched set by how well each doc's chosen fields match the query, keep
 * what clears the threshold, best first. The fetch is already ordered by the
 * page's own tiebreak (tier then name, or date), and the sort here is stable, so
 * two equally-relevant results keep that order rather than jump around.
 */
function rankByScore<T>(
  docs: T[],
  query: string,
  fields: (doc: T) => (string | null | undefined)[],
  limit: number,
): { docs: T[]; totalDocs: number } {
  const scored = docs
    .map((doc) => ({ doc, score: bestFieldScore(query, fields(doc)) }))
    .filter((entry) => entry.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)

  return { docs: scored.slice(0, limit).map((entry) => entry.doc), totalDocs: scored.length }
}

/** Listings ranked by how well the query matches the name or tagline. */
async function searchListings(locale: Locale, q: string, limit: number) {
  const payload = await client()
  const result = await payload.find({
    collection: 'businesses',
    locale: dataLocale(locale),
    depth: 1,
    limit: CANDIDATE_CAP,
    // Paying listings first, then alphabetical - the same order the directory
    // uses, so equally-relevant results do not change rank by how you arrived.
    sort: ['-tier', 'name'],
    overrideAccess: false,
  })

  return rankByScore(result.docs, q, (doc) => [doc.name, doc.tagline], limit)
}

/**
 * Articles ranked by how well the query matches the title or excerpt.
 *
 * The body is deliberately not scored. It is Lexical rich text stored as JSON, so
 * matching over it matches the markup as readily as the prose - a search for
 * "text" would rank every article ever written. The title and excerpt are the
 * human summary and are what a reader is searching for.
 */
async function searchArticles(locale: Locale, q: string, limit: number) {
  const payload = await client()
  const result = await payload.find({
    collection: 'articles',
    locale: dataLocale(locale),
    depth: 1,
    limit: CANDIDATE_CAP,
    sort: ['-publishedAt', '-createdAt'],
    overrideAccess: false,
  })

  return rankByScore(result.docs, q, (doc) => [doc.title, doc.excerpt], limit)
}

export interface SearchResults {
  /** The cleaned query, or null when there was nothing worth running. */
  query: string | null
  listings: Awaited<ReturnType<typeof searchListings>>
  articles: Awaited<ReturnType<typeof searchArticles>>
  total: number
}

export async function search({ locale, q, limit = 12 }: SearchQuery): Promise<SearchResults> {
  const query = normaliseQuery(q)

  if (!query) {
    return {
      query: null,
      listings: { docs: [], totalDocs: 0 },
      articles: { docs: [], totalDocs: 0 },
      total: 0,
    }
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
