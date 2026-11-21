import { beforeEach, describe, expect, it, vi } from 'vitest'

const find = vi.fn()
const findGlobal = vi.fn()

vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }))
vi.mock('payload', () => ({ getPayload: async () => ({ find, findGlobal }) }))
vi.mock('../payload.config', () => ({ default: {} }))
vi.mock('./db', () => ({ rawDb: () => ({}) }))

import { findFeaturedListings } from './listings'

describe('the home page band', () => {
  beforeEach(() => {
    find.mockReset()
    findGlobal.mockReset()
    find.mockResolvedValue({ docs: [{ id: 1 }, { id: 2 }, { id: 3 }] })
  })

  it('is queried from platinum only, never gold', async () => {
    findGlobal.mockResolvedValue({})
    await findFeaturedListings({ locale: 'en' })
    const args = find.mock.calls[0]![0]
    expect(args.collection).toBe('businesses')
    expect(args.where).toEqual({ tier: { in: ['platinum'] } })
    expect(JSON.stringify(args.where)).not.toContain('gold')
    // Public read: access rules apply, so drafts and staff fields stay out.
    expect(args.overrideAccess).toBe(false)
  })

  it('shows as many as the platinum setting, defaulting to six', async () => {
    findGlobal.mockResolvedValue({ maxPlatinum: 2 })
    expect(await findFeaturedListings({ locale: 'en' })).toHaveLength(2)
    expect(find.mock.calls[0]![0].limit).toBe(2)

    find.mockClear()
    findGlobal.mockResolvedValue({})
    await findFeaturedListings({ locale: 'en' })
    expect(find.mock.calls[0]![0].limit).toBe(6)
  })
})
