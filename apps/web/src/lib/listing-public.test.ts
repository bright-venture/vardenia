import { describe, expect, it } from 'vitest'
import {
  bookingExtrasOf,
  contactLinks,
  hotelFacilitiesView,
  seatingAreaViews,
  stayFactsView,
  stayPackagesOf,
} from './listing-public'

describe('contactLinks', () => {
  it('is empty for nothing', () => {
    expect(contactLinks(undefined)).toEqual([])
    expect(contactLinks({})).toEqual([])
    expect(contactLinks({ phone: '  ', email: null })).toEqual([])
  })

  it('builds tel, whatsapp, mailto and social links in a fixed order', () => {
    const links = contactLinks({
      instagram: 'https://instagram.com/lenour',
      email: 'hello@lenour.com',
      whatsapp: '+961 70 123 456',
      phone: '+961 1 234 567',
    })
    expect(links.map((l) => l.field)).toEqual(['phone', 'whatsapp', 'email', 'instagram'])
    expect(links[0]!.href).toBe('tel:+9611234567')
    expect(links[1]!.href).toBe('https://wa.me/96170123456')
    expect(links[2]!.href).toBe('mailto:hello@lenour.com')
    expect(links[3]).toMatchObject({ href: 'https://instagram.com/lenour', text: 'instagram.com' })
  })

  it('never links a value the contact rules refuse', () => {
    expect(
      contactLinks({
        phone: 'javascript:alert(1)',
        instagram: 'javascript:alert(1)',
        facebook: 'http://facebook.com/x',
        email: 'not an email',
      }),
    ).toEqual([])
  })
})

describe('hotelFacilitiesView', () => {
  const hotel = ['hotels']
  it('is null for a non-hotel or with nothing set', () => {
    expect(
      hotelFacilitiesView({ subcategories: ['restaurants'], facilities: ['wifi'] }, 'en'),
    ).toBeNull()
    expect(hotelFacilitiesView({ subcategories: hotel, facilities: [] }, 'en')).toBeNull()
  })

  it('puts popular first and does not repeat them', () => {
    const view = hotelFacilitiesView(
      {
        subcategories: hotel,
        facilities: ['pool', 'laundry', 'concierge'],
        popularFacilities: ['pool'],
        propertyHighlights: ['parking'],
      },
      'en',
    )!
    expect(view.popular).toHaveLength(1)
    expect(view.others).toHaveLength(2)
    expect(view.highlights).toEqual(['Parking'])
  })

  it('reads Arabic labels in Arabic', () => {
    const view = hotelFacilitiesView(
      { subcategories: hotel, propertyHighlights: ['parking'] },
      'ar',
    )!
    expect(view.highlights).toEqual(['موقف سيارات'])
  })
})

describe('stay facts', () => {
  const gh = ['getaways']
  it('is null for another kind of place or an untouched group', () => {
    expect(stayFactsView({ subcategories: ['hotels'], stay: { nightlyPrice: 100 } })).toBeNull()
    expect(
      stayFactsView({
        subcategories: gh,
        stay: { extraGuestFee: 0, minNights: 1, childrenCountAsGuests: true, packages: [] },
        features: { pool: false },
      }),
    ).toBeNull()
  })

  it('summarises price, limits, packages and features', () => {
    const view = stayFactsView({
      subcategories: gh,
      stay: {
        nightlyPrice: 150,
        includedGuests: 4,
        maxGuests: 8,
        extraGuestFee: 20,
        minNights: 2,
        packages: [
          { id: 'a', label: 'Weekend', price: 300, unit: 'per-stay', active: true },
          { id: 'b', label: 'Off', price: 10, unit: 'per-night', active: false },
        ],
      },
      features: { pool: true, barbecue: false, gardenAccess: true },
    })!
    expect(view.nightlyPrice).toBe(150)
    expect(view.minNights).toBe(2)
    expect(view.extraGuestFee).toBe(20)
    expect(view.packages.map((p) => p.id)).toEqual(['a'])
    expect(view.features).toEqual(['gardenAccess', 'pool'])
  })

  it('shows features alone when there is no pricing', () => {
    const view = stayFactsView({ subcategories: gh, features: { pool: true } })!
    expect(view.nightlyPrice).toBeNull()
    expect(view.features).toEqual(['pool'])
  })
})

describe('stayPackagesOf', () => {
  it('drops inactive, unnamed and unpriced packages', () => {
    expect(
      stayPackagesOf({
        packages: [
          { id: '1', label: 'A', price: 1 },
          { id: '2', label: '', price: 1 },
          { id: '3', label: 'C' },
          { id: '4', label: 'D', price: 4, active: false },
          { label: 'E', price: 5 },
        ],
      }).map((p) => p.id),
    ).toEqual(['1'])
  })
})

describe('seating areas and booking extras', () => {
  const restaurant = ['restaurants']
  it('lists valid areas for a restaurant only', () => {
    const rows = [
      { setting: 'indoor', smoking: false, tables: 4, label: 'Hall' },
      { setting: 'outdoor', smoking: true, tables: 2 },
    ]
    expect(
      seatingAreaViews({ subcategories: restaurant, seatingAreas: rows }).map((a) => a.key),
    ).toEqual(['indoor', 'outdoor-smoking'])
    expect(seatingAreaViews({ subcategories: ['hotels'], seatingAreas: rows })).toEqual([])
    expect(seatingAreaViews({ subcategories: restaurant })).toEqual([])
  })

  it('offers extras only when there is something to choose', () => {
    expect(bookingExtrasOf({ subcategories: restaurant })).toBeNull()
    expect(
      bookingExtrasOf({
        subcategories: restaurant,
        seatingAreas: [{ setting: 'indoor', tables: 3 }],
      })?.areas,
    ).toHaveLength(1)
    expect(
      bookingExtrasOf({
        subcategories: ['getaways'],
        stay: { packages: [{ id: 'a', label: 'W', price: 1 }] },
      })?.packages,
    ).toHaveLength(1)
    // A guest house with no packages still gets the total.
    expect(bookingExtrasOf({ subcategories: ['getaways'] })).toEqual({ areas: [], packages: [] })
    expect(bookingExtrasOf({ subcategories: ['hotels'] })).toBeNull()
  })
})
