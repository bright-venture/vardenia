import { describe, expect, it } from 'vitest'
import { isHomeCandidate, selectHomePlaces, type HomeCandidate } from './home-selection'

// Synthetic fixtures for selection logic only. Never imported by production pages.
const place = (id: number, overrides: Partial<HomeCandidate> = {}): HomeCandidate => ({
  id,
  slug: `test-place-${id}`,
  name: `Test place ${id}`,
  category: 'hospitality',
  governorate: 'beirut',
  _status: 'published',
  verified: true,
  heroImage: { url: `/test-only/photo-${id}.jpg`, mimeType: 'image/jpeg' },
  ...overrides,
})

describe('homepage directory selection', () => {
  it('requires an actual published, verified record and photograph', () => {
    for (const override of [
      { _status: 'draft' as const },
      { _status: undefined },
      { verified: false },
      { verified: undefined },
      { slug: '' },
      { name: ' ' },
      { heroImage: null },
      { heroImage: 5 },
      { heroImage: { url: '/test-only/movie.mp4', mimeType: 'video/mp4' } },
      { heroImage: { url: '/test-only/document.pdf', mimeType: 'application/pdf' } },
      { heroImage: { url: '/test-only/unknown-file' } },
      {
        heroImage: {
          url: '/api/media/file/import-placeholder-900x1200.webp',
          mimeType: 'image/webp',
        },
      },
    ]) {
      expect(isHomeCandidate(place(1, override))).toBe(false)
    }
    expect(isHomeCandidate(place(1))).toBe(true)
  })

  it('balances categories and regions before repeating the same kind of place', () => {
    const places = [
      place(1),
      place(2),
      place(3, { category: 'food-and-beverage', governorate: 'north' }),
      place(4, { category: 'tourism', governorate: 'bekaa' }),
      place(5, { category: 'shopping', governorate: 'south' }),
      place(6, { category: 'wellness', governorate: 'mount-lebanon' }),
      place(7, { category: 'transport', governorate: 'beirut' }),
    ]
    const picks = selectHomePlaces(places)
    expect(picks.map((listing) => listing.id)).toEqual([1, 3, 4, 5, 6, 7])
    expect(new Set(picks.map((listing) => listing.category)).size).toBe(6)
    expect(new Set(picks.map((listing) => listing.governorate)).size).toBe(5)
    expect(places).toHaveLength(7)
  })

  it('deduplicates records and skips existing paid placements', () => {
    expect(
      selectHomePlaces(
        [place(1), place(2), place(2), place(3, { slug: 'test-place-2' }), place(4)],
        [1],
      ).map((listing) => listing.id),
    ).toEqual([2, 4])
  })

  it('shows up to six real places without inventing a minimum count', () => {
    expect(selectHomePlaces(Array.from({ length: 12 }, (_, index) => place(index)))).toHaveLength(6)
    expect(selectHomePlaces([place(1), place(2)])).toHaveLength(2)
    expect(selectHomePlaces([])).toEqual([])
    expect(selectHomePlaces([place(1, { heroImage: null })])).toEqual([])
  })

  it('does not count missing categories or regions as new coverage', () => {
    const picks = selectHomePlaces([
      place(1, { category: null, governorate: null }),
      place(2),
      place(3, { category: 'tourism', governorate: 'north' }),
    ])
    expect(picks.map((listing) => listing.id)).toEqual([2, 3, 1])
  })

  it('keeps the same places and order when names are translated', () => {
    const places = [place(1), place(2, { category: 'tourism', governorate: 'north' })]
    expect(selectHomePlaces(places).map((listing) => listing.id)).toEqual(
      selectHomePlaces(
        places.map((listing) => ({ ...listing, name: 'اسم تجريبي طويل للاختبار' })),
      ).map((listing) => listing.id),
    )
  })
})
