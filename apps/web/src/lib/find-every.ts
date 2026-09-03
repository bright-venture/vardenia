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
