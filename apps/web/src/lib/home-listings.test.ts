import { beforeEach, describe, expect, it, vi } from 'vitest'
const { find, reportError, cached } = vi.hoisted(() => ({
  find: vi.fn(),
  reportError: vi.fn(),
  cached: vi.fn((fn: () => unknown) => fn),
}))
vi.mock('next/cache', () => ({ unstable_cache: cached }))
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ find })) }))
vi.mock('../payload.config', () => ({ default: {} }))
vi.mock('./report', () => ({ reportError }))
import { findHomeListings } from './home-listings'

const fixture = (id: number) => ({
  id,
  name: `Synthetic test place ${id}`,
  slug: `test-${id}`,
  _status: 'published',
  verified: true,
  category: 'hospitality',
  governorate: 'beirut',
  heroImage: { url: `/test-only/photo-${id}.jpg`, mimeType: 'image/jpeg' },
})

beforeEach(() => {
  vi.clearAllMocks()
  find.mockResolvedValue({ docs: [fixture(1), fixture(2)], hasNextPage: false })
})

describe('public homepage listing reads', () => {
  it('applies public access, published and verified filters to both reads', async () => {
    expect((await findHomeListings({ locale: 'en' })).map((listing) => listing.id)).toEqual([1, 2])
    expect(find).toHaveBeenCalledTimes(2)
    for (const [query] of find.mock.calls) {
      expect(query.overrideAccess).toBe(false)
      expect(JSON.stringify(query.where)).toContain('"_status":{"equals":"published"}')
      expect(JSON.stringify(query.where)).toContain('"verified":{"equals":true}')
      expect(query.select).not.toHaveProperty('description')
      expect(query.select).not.toHaveProperty('gallery')
    }
    expect(find.mock.calls[0]![0].populate).toEqual({
      media: { url: true, filename: true, mimeType: true },
    })
    expect(find.mock.calls[1]![0].limit).toBe(2)
    expect(cached).toHaveBeenCalledWith(expect.any(Function), ['home-listings', 'en', ''], {
      revalidate: 3600,
      tags: ['businesses', 'media'],
    })
  })

  it('uses CMS content locales and excludes paid placements before choosing cards', async () => {
    await findHomeListings({ locale: 'fr', excludedIds: [2] })
    expect(find.mock.calls[0]![0].locale).toBe('fr')
    expect(find.mock.calls[1]![0].where.and[1]).toEqual({ id: { in: [1] } })
    await findHomeListings({ locale: 'ar' })
    expect(find.mock.calls[2]![0].locale).toBe('ar')
  })

  it('does not fetch card details when no real qualifying photos exist', async () => {
    find.mockResolvedValue({ docs: [{ ...fixture(1), heroImage: null }], hasNextPage: false })
    expect(await findHomeListings({ locale: 'en' })).toEqual([])
    expect(find).toHaveBeenCalledTimes(1)
  })

  it('drops records that lose verification between the two reads', async () => {
    find
      .mockResolvedValueOnce({ docs: [fixture(1), fixture(2)], hasNextPage: false })
      .mockResolvedValueOnce({ docs: [{ ...fixture(1), verified: false }, fixture(2)] })
    expect((await findHomeListings({ locale: 'en' })).map((listing) => listing.id)).toEqual([2])
  })

  it('hides the optional section on read failure without caching fabricated data', async () => {
    const error = new Error('Test database unavailable')
    find.mockRejectedValueOnce(error)
    expect(await findHomeListings({ locale: 'en' })).toEqual([])
    expect(reportError).toHaveBeenCalledWith(error, { source: 'listings.home-selection' })
  })
})
