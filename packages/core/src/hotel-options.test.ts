import { describe, expect, it } from 'vitest'
import {
  HOTEL_FACILITIES,
  MAX_POPULAR_FACILITIES,
  MAX_PROPERTY_HIGHLIGHTS,
  PROPERTY_HIGHLIGHTS,
  ROOM_AMENITIES,
  ROOM_VIEWS,
  facilityProblem,
  fromPrice,
  validPrice,
} from './hotel-options'

const lists = { ROOM_VIEWS, ROOM_AMENITIES, HOTEL_FACILITIES, PROPERTY_HIGHLIGHTS }

describe('option lists', () => {
  it.each(Object.entries(lists))('%s has unique slugs and both labels', (_name, list) => {
    const slugs = list.map((o) => o.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const o of list) {
      expect(o.en.length).toBeGreaterThan(0)
      expect(o.ar).toMatch(/[؀-ۿ]/)
    }
  })

  it('has no slug in both room views and room amenities', () => {
    const views = new Set(ROOM_VIEWS.map((o) => o.slug))
    expect(ROOM_AMENITIES.filter((o) => views.has(o.slug))).toEqual([])
  })

  it('keeps every room slug that existed before', () => {
    const oldViews = ['sea', 'mountain', 'city', 'garden', 'pool']
    const oldAmenities = [
      'private-bathroom',
      'balcony',
      'kitchenette',
      'air-conditioning',
      'heating',
      'wifi',
      'tv',
      'minibar',
      'coffee-machine',
      'bathtub',
      'work-desk',
      'safe',
      'soundproofing',
      'fireplace',
    ]
    expect(ROOM_VIEWS.map((o) => o.slug).slice(0, 5)).toEqual(oldViews)
    expect(ROOM_AMENITIES.map((o) => o.slug).slice(0, 14)).toEqual(oldAmenities)
  })

  it('adds the new room options', () => {
    const all = [...ROOM_VIEWS, ...ROOM_AMENITIES].map((o) => o.slug)
    for (const s of [
      'landmark-view',
      'shared-bathroom',
      'shower',
      'terrace',
      'kettle',
      'refrigerator',
      'microwave',
      'seating-area',
      'dining-area',
      'sofa',
      'wardrobe',
      'hairdryer',
      'free-toiletries',
      'bathrobes',
      'slippers',
      'iron',
      'extra-bed-available',
      'crib-available',
    ]) {
      expect(all).toContain(s)
    }
  })

  it('has the full facility and highlight lists', () => {
    expect(HOTEL_FACILITIES).toHaveLength(33)
    expect(PROPERTY_HIGHLIGHTS.map((o) => o.slug)).toEqual([
      'parking',
      'wellness',
      'breakfast',
      'pool',
      'beachfront',
      'mountain-view',
      'city-centre',
      'family-friendly',
      'romantic',
      'business-friendly',
      'pet-friendly',
      'quiet-location',
    ])
  })
})

describe('validPrice', () => {
  it.each([undefined, null, 0, 1, 80, 80.5, 80.25])('accepts %s', (v) => {
    expect(validPrice(v)).toBe(true)
  })
  it.each([-1, 80.123, NaN, Infinity, '80', true])('refuses %s', (v) => {
    expect(validPrice(v)).not.toBe(true)
  })
})

describe('fromPrice', () => {
  it('is the lowest price', () => {
    expect(fromPrice([{ price: 90 }, { price: 70 }, { price: 120 }])).toBe(70)
  })
  it('counts a price of 0', () => {
    expect(fromPrice([{ price: 0 }, { price: 70 }])).toBe(0)
  })
  it('ignores options with no price', () => {
    expect(fromPrice([{ price: null }, {}, { price: 55 }])).toBe(55)
  })
  it('is null when nothing has a price', () => {
    expect(fromPrice([])).toBeNull()
    expect(fromPrice(null)).toBeNull()
    expect(fromPrice([{ price: null }, {}])).toBeNull()
  })
})

describe('facilityProblem', () => {
  const hotel = ['hotels']
  it('accepts a hotel with a subset', () => {
    expect(
      facilityProblem({
        subcategories: hotel,
        facilities: ['restaurant', 'bar', 'breakfast'],
        popularFacilities: ['bar', 'breakfast'],
        propertyHighlights: ['wellness'],
      }),
    ).toBeNull()
  })
  it('refuses a getaway: hotels only since getaways stopped having room types (Task 6)', () => {
    expect(facilityProblem({ subcategories: ['getaways'], facilities: ['garden'] })).toMatch(
      /only for hotels/,
    )
  })
  it('refuses popular facilities outside the full list', () => {
    expect(
      facilityProblem({
        subcategories: hotel,
        facilities: ['bar'],
        popularFacilities: ['spa-wellness'],
      }),
    ).toMatch(/spa-wellness/)
  })
  it('refuses more than 8 popular and 6 highlights', () => {
    const nine = HOTEL_FACILITIES.slice(0, MAX_POPULAR_FACILITIES + 1).map((o) => o.slug)
    expect(
      facilityProblem({ subcategories: hotel, facilities: nine, popularFacilities: nine }),
    ).toMatch(/8/)
    const seven = PROPERTY_HIGHLIGHTS.slice(0, MAX_PROPERTY_HIGHLIGHTS + 1).map((o) => o.slug)
    expect(facilityProblem({ subcategories: hotel, propertyHighlights: seven })).toMatch(/6/)
  })
  it('refuses any of them on a restaurant', () => {
    expect(facilityProblem({ subcategories: ['restaurants'], facilities: ['bar'] })).toMatch(
      /hotel/i,
    )
    expect(
      facilityProblem({ subcategories: ['restaurants'], propertyHighlights: ['pool'] }),
    ).toMatch(/hotel/i)
    expect(facilityProblem({ subcategories: ['restaurants'], popularFacilities: ['bar'] })).toMatch(
      /hotel/i,
    )
  })
  it('allows empty on a restaurant', () => {
    expect(
      facilityProblem({ subcategories: ['restaurants'], facilities: [], popularFacilities: null }),
    ).toBeNull()
  })
})
