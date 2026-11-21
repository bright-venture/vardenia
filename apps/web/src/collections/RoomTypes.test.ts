import { describe, expect, it } from 'vitest'
import type { Access, Field } from 'payload'
import {
  HOTEL_FACILITIES,
  PROPERTY_HIGHLIGHTS,
  ROOM_AMENITIES,
  ROOM_VIEWS,
  validPrice,
} from '@vardenia/core'
import { RoomTypes } from './RoomTypes'
import { Businesses } from './Businesses'
import { dataFields } from '../lib/field-shape'

type Loose = Field & {
  name: string
  fields?: Field[]
  options?: { value: string }[]
  hasMany?: boolean
  access?: { read?: (a: never) => unknown }
  validate?: (v: unknown, o: { data: object }) => unknown
}
const top = (name: string) => dataFields(RoomTypes.fields).find((f) => f.name === name) as Loose
const optionField = (name: string) =>
  dataFields(top('options').fields as Field[]).find((f) => f.name === name) as Loose

const PUBLIC_RULE = {
  and: [
    { active: { equals: true } },
    { 'business._status': { equals: 'published' } },
    { 'business.deletedAt': { exists: false } },
  ],
}
const read = (user: unknown) => (RoomTypes.access!.read as Access)({ req: { user } } as never)

describe('room options come from core', () => {
  it('offers exactly the core views and amenities', () => {
    expect(top('views').options!.map((o) => o.value)).toEqual(ROOM_VIEWS.map((o) => o.slug))
    expect(top('amenities').options!.map((o) => o.value)).toEqual(ROOM_AMENITIES.map((o) => o.slug))
  })
})

describe('the price', () => {
  it('is publicly readable (no field-level read rule)', () => {
    const price = optionField('price')
    expect(price.access?.read).toBeUndefined()
  })

  it('is validated: a number, 0 or more, at most two decimals', () => {
    const price = optionField('price')
    expect(price.validate!(0, { data: {} })).toBe(true)
    expect(price.validate!(79.99, { data: {} })).toBe(true)
    expect(price.validate!(null, { data: {} })).toBe(true)
    expect(price.validate!(-1, { data: {} })).not.toBe(true)
    expect(price.validate!(79.999, { data: {} })).not.toBe(true)
    expect(validPrice(79.999)).not.toBe(true)
  })
})

describe('which room types the public can read', () => {
  it('is active types of published, not-trashed listings only, for anonymous callers', () => {
    expect(read(null)).toEqual(PUBLIC_RULE)
  })

  it('adds an owner own listings, whatever their state', () => {
    const where = read({ id: 5, collection: 'business-users', businesses: [10] }) as {
      or: unknown[]
    }
    expect(where.or).toContainEqual({ business: { in: [10] } })
    expect(where.or).toContainEqual(PUBLIC_RULE)
  })

  it('lets the team read everything', () => {
    expect(read({ id: 1, collection: 'users', roles: ['staff'] })).toBe(true)
  })
})

describe('hotel facility fields on businesses', () => {
  const find = (name: string) => dataFields(Businesses.fields).find((f) => f.name === name) as Loose

  it.each([
    ['facilities', HOTEL_FACILITIES],
    ['popularFacilities', HOTEL_FACILITIES],
    ['propertyHighlights', PROPERTY_HIGHLIGHTS],
  ] as const)('%s is a public select hasMany of the core list', (name, list) => {
    const f = find(name)
    expect(f.type).toBe('select')
    expect(f.hasMany).toBe(true)
    expect(f.options!.map((o) => o.value)).toEqual(list.map((o) => o.slug))
    expect(f.access?.read).toBeUndefined()
  })

  it('refuses facilities on a restaurant, with a message', () => {
    const r = find('facilities').validate!(['bar'], { data: { subcategories: ['restaurants'] } })
    expect(r).toEqual(expect.stringMatching(/hotel/i))
  })

  it('accepts them on a hotel, and refuses a popular one not in the list', () => {
    const data = { subcategories: ['hotels'], facilities: ['bar'], popularFacilities: ['garden'] }
    expect(find('facilities').validate!(['bar'], { data })).toBe(true)
    expect(find('popularFacilities').validate!(['garden'], { data })).toEqual(
      expect.stringMatching(/garden/),
    )
  })

  it('caps popular facilities at 8 and highlights at 6', () => {
    const nine = HOTEL_FACILITIES.slice(0, 9).map((o) => o.slug)
    const data = { subcategories: ['hotels'], facilities: nine, popularFacilities: nine }
    expect(find('popularFacilities').validate!(nine, { data })).toEqual(expect.stringMatching(/8/))
    const seven = PROPERTY_HIGHLIGHTS.slice(0, 7).map((o) => o.slug)
    expect(
      find('propertyHighlights').validate!(seven, {
        data: { subcategories: ['hotels'], propertyHighlights: seven },
      }),
    ).toEqual(expect.stringMatching(/6/))
  })
})

describe('validators see the merged document, as Payload gives it on update', () => {
  const find = (name: string) => dataFields(Businesses.fields).find((f) => f.name === name) as Loose

  it('checks a PATCH of popularFacilities against the stored facilities', () => {
    // Stored: facilities [bar, garden]. PATCH sends only popularFacilities.
    const merged = {
      subcategories: ['hotels'],
      facilities: ['bar', 'garden'],
      popularFacilities: ['bar'],
    }
    expect(find('popularFacilities').validate!(['bar'], { data: merged })).toBe(true)
    const bad = { ...merged, popularFacilities: ['spa-wellness'] }
    expect(find('popularFacilities').validate!(['spa-wellness'], { data: bad })).toEqual(
      expect.stringMatching(/spa-wellness/),
    )
  })

  it('applies the hotels-only rule from stored subcategories on a PATCH', () => {
    const merged = {
      subcategories: ['restaurants'],
      popularFacilities: ['bar'],
      facilities: ['bar'],
    }
    expect(find('popularFacilities').validate!(['bar'], { data: merged })).toEqual(
      expect.stringMatching(/hotel/i),
    )
    const hotel = { ...merged, subcategories: ['hotels'] }
    expect(find('popularFacilities').validate!(['bar'], { data: hotel })).toBe(true)
  })
})
