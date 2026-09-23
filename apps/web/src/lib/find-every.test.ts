import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { findByIdsInOrder, findEvery } from './find-every'

/**
 * The two halves of "read everything light, then load what is shown".
 *
 * These carry the listings sitemap, the directory counts, the section tiles,
 * open-now and search, all of which were silently capped at a thousand rows
 * before production passed a thousand listings. So the thing worth pinning is
 * less the happy path than the ways a read can quietly come back short.
 *
 * Payload is faked with just enough of `find` to page through an array. The
 * real behaviour this guards against - `pagination: false` applying a limit and
 * reporting the truncated count as the total - is documented with a production
 * repro at the top of find-every.ts.
 */

type Row = { id: number }

const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: i + 1 }))

/** Pages `data` the way Payload does with pagination on, and records each call. */
function fakePayload(data: Row[]) {
  const calls: Record<string, unknown>[] = []

  const payload = {
    find: async (args: Record<string, unknown>) => {
      calls.push(args)

      if (args.where && typeof args.where === 'object' && 'id' in args.where) {
        // Compared as strings, as Postgres coerces `id = '5'` against an integer.
        const wanted = (args.where as { id: { in: (number | string)[] } }).id.in.map(String)
        // Deliberately not in the requested order: `in` has none.
        const docs = data.filter((row) => wanted.includes(String(row.id))).reverse()
        return { docs }
      }

      const limit = Number(args.limit)
      const page = Number(args.page)
      const docs = data.slice((page - 1) * limit, page * limit)
      return { docs, hasNextPage: page * limit < data.length }
    },
  } as unknown as Payload

  return { payload, calls }
}

describe('findEvery', () => {
  it('reads past a thousand, which is where the old limit stopped', async () => {
    const { payload } = fakePayload(rows(1277))

    const result = await findEvery<Row>(payload, { collection: 'businesses' })

    expect(result.complete).toBe(true)
    expect(result.docs).toHaveLength(1277)
    expect(result.docs.at(-1)).toEqual({ id: 1277 })
  })

  it('keeps the order the pages came back in', async () => {
    const { payload } = fakePayload(rows(1200))

    const { docs } = await findEvery<Row>(payload, { collection: 'businesses' })

    expect(docs.map((row) => row.id)).toEqual(rows(1200).map((row) => row.id))
  })

  /**
   * The trap itself. With pagination off Payload applies the limit anyway and
   * reports the truncated number as the total, so `hasNextPage` would never be
   * true and a short read would look complete.
   */
  it('never turns pagination off, because that is what hides a short read', async () => {
    const { payload, calls } = fakePayload(rows(1277))

    await findEvery<Row>(payload, { collection: 'businesses' })

    for (const call of calls) expect(call.pagination).toBeUndefined()
  })

  it('says so when the ceiling is reached rather than returning part quietly', async () => {
    const { payload } = fakePayload(rows(1277))

    const result = await findEvery<Row>(payload, { collection: 'businesses' }, 2)

    expect(result.complete).toBe(false)
    expect(result.docs).toHaveLength(1000)
  })

  it('is complete when the last page is exactly full', async () => {
    const { payload } = fakePayload(rows(1000))

    const result = await findEvery<Row>(payload, { collection: 'businesses' }, 2)

    expect(result.complete).toBe(true)
    expect(result.docs).toHaveLength(1000)
  })
})

describe('findByIdsInOrder', () => {
  it('returns documents in the order the ids were given, not the database order', async () => {
    const { payload } = fakePayload(rows(50))

    const docs = await findByIdsInOrder<Row>(payload, [30, 4, 17], { collection: 'businesses' })

    expect(docs.map((row) => row.id)).toEqual([30, 4, 17])
  })

  /**
   * Payload's default limit is ten, so a search page of twelve results would
   * have lost two without an explicit limit.
   */
  it('asks for as many rows as it was given ids, past the default of ten', async () => {
    const { payload, calls } = fakePayload(rows(50))
    const ids = rows(12).map((row) => row.id)

    const docs = await findByIdsInOrder<Row>(payload, ids, { collection: 'businesses' })

    expect(calls[0]?.limit).toBe(12)
    expect(docs).toHaveLength(12)
  })

  it('drops an id that no longer resolves instead of leaving a hole', async () => {
    const { payload } = fakePayload(rows(10))

    const docs = await findByIdsInOrder<Row>(payload, [3, 999, 7], { collection: 'businesses' })

    expect(docs.map((row) => row.id)).toEqual([3, 7])
  })

  it('does not query at all for no ids', async () => {
    const { payload, calls } = fakePayload(rows(10))

    const docs = await findByIdsInOrder<Row>(payload, [], { collection: 'businesses' })

    expect(docs).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('matches string and numeric ids alike', async () => {
    const { payload } = fakePayload(rows(10))

    const docs = await findByIdsInOrder<Row>(payload, ['5', '2'], { collection: 'businesses' })

    expect(docs.map((row) => row.id)).toEqual([5, 2])
  })
})
