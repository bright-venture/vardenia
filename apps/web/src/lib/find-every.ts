import type { Payload } from 'payload'

/**
 * Every document matching a query, fetched a page at a time.
 *
 * # Why not `limit: <big number>`
 *
 * Because Payload gives no usable signal when the number was too small. With
 * `pagination: false` it applies the limit anyway *and* reports the truncated
 * count as the total, so the response cannot be distinguished from a complete
 * one. Verified against production:
 *
 *   ?limit=5                    ->  5 docs, totalDocs=153
 *   ?limit=5&pagination=false   ->  5 docs, totalDocs=5     <-
 *   ?pagination=false           -> 153 docs, totalDocs=153
 *
 * With pagination left on, `totalDocs` is honest - but every caller then has to
 * remember to compare it against `docs.length`, and the two places in this
 * codebase that used a big limit both forgot.
 *
 * Dropping the limit entirely returns everything and trades a silent wrong
 * answer for an unbounded read. This pages instead: bounded per query, complete
 * overall.
 *
 * # `complete` rather than a throw
 *
 * The ceiling is not the same decision everywhere, so this reports and lets the
 * caller choose. A staff report that is missing rows should fail loudly - the
 * whole point of a worklist is that it is exhaustive. A number decorating a
 * partner's dashboard should not take the page down with it; it should stop
 * claiming to be a number.
 *
 * Both are correct, and neither is "return part of the answer and say nothing",
 * which is what this replaced.
 */

export interface FindEveryResult<T> {
  docs: T[]
  /** False when the ceiling was reached before the query ran out of rows. */
  complete: boolean
}

const PAGE_SIZE = 500

/**
 * Fifty thousand documents is far past the point where fetching whole rows to
 * count them is the right shape - that is a `GROUP BY`. The ceiling exists so
 * that day announces itself rather than arriving as quietly wrong output.
 */
const MAX_PAGES = 100

export async function findEvery<T>(
  payload: Payload,
  args: Omit<Parameters<Payload['find']>[0], 'limit' | 'page' | 'pagination'>,
  maxPages: number = MAX_PAGES,
): Promise<FindEveryResult<T>> {
  const docs: T[] = []

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await payload.find({ ...args, limit: PAGE_SIZE, page })
    docs.push(...(result.docs as T[]))
    if (!result.hasNextPage) return { docs, complete: true }
  }

  return { docs, complete: false }
}

/** The ceiling in documents, for a caller that wants to say so in an error. */
export const FIND_EVERY_CEILING = PAGE_SIZE * MAX_PAGES

/**
 * Full documents for a list of ids, in the order the ids were given.
 *
 * The second half of "decide on light rows, then load what is shown". Search
 * and open-now both need to look at every candidate to choose a handful, and
 * they only need one or two fields to choose - a name to score, the opening
 * hours to test. Fetching every candidate at `depth: 1`, with its images
 * joined in, to throw nearly all of them away was the expensive part.
 *
 * So the caller reads the whole set through `findEvery` with a narrow `select`
 * and no depth, picks its ids, and hands them here. One more round trip, for
 * exactly the documents that will render.
 *
 * `where: { id: { in } }` has no order of its own, so the result is put back
 * into the caller's. An id that no longer resolves - unpublished between the
 * two reads - is dropped rather than left as a hole.
 *
 * The `limit` with `pagination: false` below is the shape the top of this file
 * warns about, and it is safe here only because the limit is the length of the
 * id list: no more rows than that can match, so there is nothing to truncate.
 * It is set at all because Payload's default limit is ten.
 */
export async function findByIdsInOrder<T extends { id: number | string }>(
  payload: Payload,
  ids: readonly (number | string)[],
  args: Omit<Parameters<Payload['find']>[0], 'where' | 'limit' | 'page' | 'pagination'>,
): Promise<T[]> {
  if (ids.length === 0) return []

  const result = await payload.find({
    ...args,
    where: { id: { in: [...ids] } },
    limit: ids.length,
    pagination: false,
  })

  // Through `unknown` because Payload types `docs` as the union of every
  // collection, and a constrained T cannot be cast to from that directly.
  const byId = new Map((result.docs as unknown as T[]).map((doc) => [String(doc.id), doc]))
  return ids.map((id) => byId.get(String(id))).filter((doc): doc is T => doc !== undefined)
}
