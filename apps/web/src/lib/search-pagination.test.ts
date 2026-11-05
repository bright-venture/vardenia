import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }))
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('../payload.config', () => ({ default: {} }))
vi.mock('./report', () => ({ reportError: vi.fn() }))
vi.mock('./find-every', () => ({
  FIND_EVERY_CEILING: 50000,
  findEvery: vi.fn(),
  findByIdsInOrder: vi.fn(async (_payload, ids: number[]) => ids.map((id) => ({ id }))),
}))
import { findByIdsInOrder, findEvery } from './find-every'
import { normaliseSearchPage, search } from './search'
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(findEvery).mockImplementation(async (_payload, args) => ({
    complete: true,
    docs: Array.from({ length: args.collection === 'businesses' ? 29 : 14 }, (_, i) => ({
      id: i + 1,
      name: 'Byblos',
      title: 'Byblos',
    })),
  }))
})
describe('search pagination', () => {
  it('preserves the first twelve and full match count by default', async () => {
    const result = await search({ locale: 'en', q: 'Byblos' })
    expect(result.total).toBe(43)
    expect(result.listings).toMatchObject({ page: 1, totalPages: 3, totalDocs: 29 })
    expect(result.listings.docs.map((doc) => doc.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    )
  })
  it('reaches every match without repeats and pages each collection independently', async () => {
    const second = await search({ locale: 'ar', q: 'Byblos', listingsPage: 2 })
    expect(second.listings.docs.map((doc) => doc.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 13),
    )
    expect(second.articles.page).toBe(1)
    const last = await search({ locale: 'ar', q: 'Byblos', listingsPage: 3, articlesPage: 2 })
    expect(last.listings.docs.map((doc) => doc.id)).toEqual([25, 26, 27, 28, 29])
    expect(last.articles.docs.map((doc) => doc.id)).toEqual([13, 14])
    expect(last.total).toBe(43)
    for (const call of vi.mocked(findByIdsInOrder).mock.calls) {
      expect(call[1].length).toBeLessThanOrEqual(12)
      expect(call[2]).toMatchObject({ locale: 'ar', overrideAccess: false, depth: 1 })
    }
    for (const call of vi.mocked(findEvery).mock.calls)
      expect(call[1]).toMatchObject({ locale: 'ar', overrideAccess: false, depth: 0 })
  })
  it('clamps stale pages to the last available page', async () => {
    const result = await search({ locale: 'en', q: 'Byblos', listingsPage: 999, articlesPage: 999 })
    expect(result.listings).toMatchObject({ page: 3, totalPages: 3 })
    expect(result.listings.docs).toHaveLength(5)
    expect(result.articles).toMatchObject({ page: 2, totalPages: 2 })
  })
  it('keeps the empty-query state without reading data', async () => {
    const result = await search({ locale: 'en', q: 'a', listingsPage: 2 })
    expect(result).toMatchObject({ query: null, total: 0, listings: { page: 1, totalPages: 0 } })
    expect(findEvery).not.toHaveBeenCalled()
  })
  it('keeps no matches empty on later pages', async () => {
    vi.mocked(findEvery).mockResolvedValue({ docs: [], complete: true })
    const result = await search({ locale: 'en', q: 'Byblos', listingsPage: 2 })
    expect(result).toMatchObject({ total: 0, listings: { docs: [], page: 1, totalPages: 0 } })
  })
  it.each([
    undefined,
    [],
    ['2'],
    '2junk',
    '1.5',
    '-1',
    '',
    'Infinity',
    '1e2',
    0,
    -1,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects malformed page input %s', (value) => {
    expect(normaliseSearchPage(value)).toBe(1)
  })
  it('accepts positive whole pages', () => {
    expect(normaliseSearchPage('2')).toBe(2)
    expect(normaliseSearchPage(3)).toBe(3)
  })
})
