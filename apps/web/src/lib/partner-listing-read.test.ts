import { describe, expect, it } from 'vitest'
import { toEditable } from './partner-listing-read'
import { buildListingPatch, textToDescription } from './partner-listing-edit'

const getaway = {
  id: 7,
  name: 'Cedar House',
  subcategories: ['getaways'],
  tagline: 'Quiet',
  description: textToDescription('One\nTwo', 'ltr'),
  contact: { phone: '03 123 456', email: null },
  stay: {
    nightlyPrice: 120,
    extraGuestFee: 0,
    childrenCountAsGuests: false,
    minNights: 1,
    packages: [{ id: 'abc', label: 'Weekend', price: 300, unit: 'per-stay', active: false }],
  },
  features: { pool: true },
  seatingAreas: [],
}

describe('toEditable', () => {
  it('reads kinds from the subcategories with the core rules', () => {
    expect(toEditable(getaway).kinds).toEqual({ hotel: false, getaway: true, seating: false })
    expect(toEditable({ id: 1, subcategories: ['hotels'] }).kinds.hotel).toBe(true)
    const restaurant = toEditable({ id: 2, subcategories: ['restaurants'] })
    expect(restaurant.kinds.seating).toBe(true)
    expect(restaurant.restaurant).toBe(true)
  })

  it('reads the stored values so that saving them unchanged sends nothing', () => {
    const listing = toEditable(getaway)
    expect(listing.initial.stay.packages[0]).toMatchObject({ id: 'abc', active: false })
    expect(listing.initial.stay.childrenCountAsGuests).toBe(false)
    expect(listing.initial.description).toBe('One\nTwo')
    const { body } = buildListingPatch(listing.initial, listing.initial, listing.kinds, {
      descriptionEditable: listing.descriptionEditable,
      dir: 'ltr',
    })
    expect(body).toEqual({})
  })

  it('marks a formatted description as not editable', () => {
    const listing = toEditable({
      id: 3,
      description: { root: { type: 'root', children: [{ type: 'list', children: [] }] } },
    })
    expect(listing.descriptionEditable).toBe(false)
    expect(listing.initial.description).toBe('')
  })
})

/** Arabic words, spelled by code point so this source file stays ASCII. */
const HOLIDAY = String.fromCharCode(0x639, 0x637, 0x644, 0x629)
const OFFER = String.fromCharCode(0x628, 0x627, 0x642, 0x629)

describe('toEditable: required values from other languages (review C1)', () => {
  /** The same listing read with locale 'all': localized values per language. */
  const all = {
    id: 7,
    name: { en: 'Cedar House', ar: null },
    stay: {
      packages: [
        { id: 'abc', label: { en: 'Weekend', ar: null }, description: { en: 'Two nights' } },
        { id: 'def', label: { en: 'Holiday', ar: HOLIDAY } },
        { id: 'jkl', label: { en: null, ar: OFFER } },
      ],
    },
  }

  it('fills a blank package name from the default language, then any other, by row id', () => {
    const arabic = {
      id: 7,
      name: null,
      subcategories: ['getaways'],
      stay: {
        packages: [
          { id: 'abc', label: null, description: null, price: 300 },
          { id: 'def', label: HOLIDAY, price: 100 },
          { id: 'ghi', label: null, price: 50 },
        ],
      },
    }
    const rows = toEditable(arabic, all).initial.stay.packages
    expect(rows.map((row) => row.label)).toEqual(['Weekend', HOLIDAY, ''])
    expect(rows[0]!.description).toBe('')
  })

  it('scenario 3: on the English page a package named only in Arabic gets that name', () => {
    const english = {
      id: 7,
      name: 'Cedar House',
      subcategories: ['getaways'],
      stay: { packages: [{ id: 'jkl', label: null, price: 10 }] },
    }
    expect(toEditable(english, all).initial.stay.packages[0]!.label).toBe(OFFER)
  })

  it('scenario 1: the name to send is this language one, else the default one', () => {
    expect(toEditable({ id: 7, name: null }, all).requiredName).toBe('Cedar House')
    expect(toEditable({ id: 7, name: 'Local' }, all).requiredName).toBe('Local')
    expect(toEditable({ id: 7, name: null }, null).requiredName).toBe('')
  })

  it('reads amenities and payments (review I1)', () => {
    const listing = toEditable({
      id: 1,
      amenities: ['pool', 'wifi'],
      payments: { cash: true, card: null, omt: true },
    })
    expect(listing.initial.amenities).toEqual(['pool', 'wifi'])
    expect(listing.initial.payments).toEqual({ cash: true, card: false, whish: false, omt: true })
  })
})
