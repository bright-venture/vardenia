import { beforeEach, describe, expect, it, vi } from 'vitest'
const { find } = vi.hoisted(() => ({ find: vi.fn() }))
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }))
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ find })) }))
vi.mock('../payload.config', () => ({ default: {} }))
vi.mock('./db', () => ({ rawDb: vi.fn() }))
import { findAllListingSlugs } from './listings'
import { findAllArticleSlugs } from './articles'

beforeEach(() => {
  find.mockReset()
  find.mockResolvedValue({ docs: [{ id: 1, slug: 'published-page' }], hasNextPage: false })
})

describe.each([
  ['businesses', findAllListingSlugs],
  ['articles', findAllArticleSlugs],
] as const)('%s sitemap slugs', (collection, slugs) => {
  it('excludes explicitly hidden documents when requested by the sitemap', async () => {
    expect(await slugs({ indexableOnly: true })).toEqual(['published-page'])
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection,
        overrideAccess: false,
        where: { 'seo.noIndex': { not_equals: true } },
      }),
    )
  })

  it('preserves existing static generation behavior and access controls', async () => {
    await slugs()
    const query = find.mock.calls[0]?.[0]
    expect(query.overrideAccess).toBe(false)
    expect(query.where).toBeUndefined()
  })
})

it('keeps numbered QA listings out of the sitemap while retaining their preview route', async () => {
  find.mockResolvedValue({ docs: [
    { id: 1, name: 'QA Test Place 1238', slug: 'qa-test-place-1238' },
    { id: 2, name: 'Qamar', slug: 'qamar' },
  ], hasNextPage: false })
  expect(await findAllListingSlugs({ indexableOnly: true })).toEqual(['qamar'])
  expect(await findAllListingSlugs()).toEqual(['qa-test-place-1238', 'qamar'])
})
