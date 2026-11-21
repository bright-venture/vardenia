import { describe, expect, it } from 'vitest'
import { memoryPayload, type Row } from './__fixtures__/memory-payload'
import { brandSummaries, groupListingsByBrand, publicBrand } from './brands'

/**
 * The public brand page data (Task 9). Runs against the in-memory payload,
 * which applies the real read rules of brands and businesses for a public
 * (overrideAccess: false, no user) read.
 */

const listing = (over: Partial<Row>): Row => ({
  id: 1,
  name: 'Cafe Nour',
  slug: 'cafe-nour',
  _status: 'published',
  brand: 3,
  subcategories: ['restaurants'],
  address: 'Hamra',
  governorate: 'beirut',
  district: 'beirut',
  mapUrl: 'https://www.google.com/maps/@33.9,35.5,17z',
  location: [35.5, 33.9],
  openingHours: [{ id: 'r1', day: 'mon', opens: '09:00', closes: '23:00', closed: false }],
  booking: { enabled: true, capacity: 12, autoConfirm: true },
  tier: 'gold',
  verified: true,
  commission: 10,
  internalNotes: 'pays late',
  contractEndsAt: '2027-01-01',
  submission: { status: 'approved', ownerEmail: 'owner@example.com' },
  qrCode: 9,
  ...over,
})

const seed = () =>
  memoryPayload({
    brands: [
      {
        id: 3,
        name: 'Cafe Nour',
        slug: 'cafe-nour',
        logo: 50,
        description: 'Since 1990',
        published: true,
      },
      { id: 4, name: 'Hidden', slug: 'hidden', published: false },
    ],
    media: [{ id: 50, url: 'https://cdn.example/logo.png', alt: 'Nour logo', filename: 'x.png' }],
    businesses: [
      listing({ id: 1 }),
      listing({
        id: 2,
        name: 'Cafe Nour Jounieh',
        slug: 'cafe-nour-jounieh',
        booking: { enabled: false },
      }),
      listing({ id: 5, name: 'Draft branch', slug: 'draft-branch', _status: 'draft' }),
      listing({
        id: 6,
        name: 'Trashed branch',
        slug: 'trashed',
        deletedAt: '2026-11-01T00:00:00Z',
      }),
      listing({ id: 7, name: 'Hidden branch', slug: 'hidden-branch', brand: 4, _status: 'draft' }),
    ],
  })

describe('publicBrand', () => {
  it('returns the brand and its published branches only', async () => {
    const payload = seed()
    const brand = await publicBrand(payload as never, 'cafe-nour', 'en')
    expect(brand).not.toBeNull()
    expect(brand!.name).toBe('Cafe Nour')
    expect(brand!.slug).toBe('cafe-nour')
    expect(brand!.description).toBe('Since 1990')
    expect(brand!.logo).toEqual({ url: 'https://cdn.example/logo.png', alt: 'Nour logo' })
    expect(brand!.branches.map((b) => b.id).sort()).toEqual([1, 2])
  })

  it('gives each branch the public fields and nothing staff-only', async () => {
    const brand = await publicBrand(seed() as never, 'cafe-nour', 'en')
    const branch = brand!.branches.find((b) => b.id === 2)!
    expect(Object.keys(branch).sort()).toEqual(
      [
        'address',
        'bookingEnabled',
        'district',
        'governorate',
        'id',
        'location',
        'mapUrl',
        'name',
        'openingHours',
        'slug',
      ].sort(),
    )
    expect(branch.bookingEnabled).toBe(false)
    expect(branch.openingHours).toEqual([
      { day: 'mon', opens: '09:00', closes: '23:00', closed: false },
    ])
    const text = JSON.stringify(brand)
    for (const secret of [
      'gold',
      'pays late',
      'owner@example.com',
      '2027-01-01',
      'capacity',
      'commission',
      'qrCode',
      'verified',
    ]) {
      expect(text).not.toContain(secret)
    }
  })

  it('reads in public: no override, no user, the request locale', async () => {
    const payload = seed()
    await publicBrand(payload as never, 'cafe-nour', 'ar')
    const reads = payload.calls.filter((c) => c.op === 'find')
    expect(reads.length).toBeGreaterThan(0)
    for (const call of reads) {
      expect(call.args.overrideAccess).toBe(false)
      expect(call.args.user).toBeUndefined()
      expect(call.args.locale).toBe('ar')
    }
  })

  it('hides a brand with no published branch', async () => {
    expect(await publicBrand(seed() as never, 'hidden', 'en')).toBeNull()
  })

  it('hides a brand whose mirror says published but whose branches are all gone', async () => {
    const payload = memoryPayload({
      brands: [{ id: 3, name: 'Stale', slug: 'stale', published: true }],
      businesses: [listing({ id: 1, brand: 3, _status: 'draft' })],
    })
    expect(await publicBrand(payload as never, 'stale', 'en')).toBeNull()
  })

  it('answers null for an unknown or malformed slug without asking for a brand', async () => {
    const payload = seed()
    expect(await publicBrand(payload as never, 'nope', 'en')).toBeNull()
    expect(await publicBrand(payload as never, '../admin', 'en')).toBeNull()
    expect(await publicBrand(payload as never, 'x'.repeat(300), 'en')).toBeNull()
    expect(payload.calls.filter((c) => c.op === 'find').length).toBe(1)
  })

  it('leaves out a logo the public may not read', async () => {
    const payload = memoryPayload({
      brands: [{ id: 3, name: 'Cafe Nour', slug: 'cafe-nour', logo: 51, published: true }],
      media: [],
      businesses: [listing({ id: 1 })],
    })
    const brand = await publicBrand(payload as never, 'cafe-nour', 'en')
    expect(brand!.logo).toBeNull()
  })
})

describe('groupListingsByBrand', () => {
  it('groups a partner listings under their brands, unbranded last', () => {
    const groups = groupListingsByBrand(
      [
        { id: 1, name: 'Nour Hamra', brandId: 3 },
        { id: 2, name: 'Hotel Sea', brandId: null },
        { id: 3, name: 'Nour Jounieh', brandId: 3 },
        { id: 4, name: 'Zaatar', brandId: 8 },
      ],
      [
        { id: 3, name: 'Cafe Nour', slug: 'cafe-nour', published: true },
        { id: 8, name: 'Abu Zaatar', slug: 'abu-zaatar', published: false },
      ],
    )
    expect(groups.map((g) => g.brand?.name ?? null)).toEqual(['Abu Zaatar', 'Cafe Nour', null])
    expect(groups[1]!.listings.map((l) => l.id)).toEqual([1, 3])
    expect(groups[2]!.listings.map((l) => l.id)).toEqual([2])
  })

  it('keeps a listing whose brand is unknown with the unbranded ones', () => {
    const groups = groupListingsByBrand([{ id: 1, name: 'A', brandId: 99 }], [])
    expect(groups).toEqual([{ brand: null, listings: [{ id: 1, name: 'A', brandId: 99 }] }])
  })

  it('is empty for no listings', () => {
    expect(groupListingsByBrand([], [])).toEqual([])
  })
})

describe('brandSummaries', () => {
  it('reads the named brands, published or not, for the partner dashboard', async () => {
    const payload = seed()
    const brands = await brandSummaries(payload as never, [3, 4, 3], 'en')
    expect(brands.sort((a, b) => a.id - b.id)).toEqual([
      { id: 3, name: 'Cafe Nour', slug: 'cafe-nour', published: true },
      { id: 4, name: 'Hidden', slug: 'hidden', published: false },
    ])
  })

  it('asks nothing for no ids', async () => {
    const payload = seed()
    expect(await brandSummaries(payload as never, [], 'en')).toEqual([])
    expect(payload.calls).toHaveLength(0)
  })
})
