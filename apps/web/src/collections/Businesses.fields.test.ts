import { describe, expect, it, vi } from 'vitest'
import { Businesses, validTime } from './Businesses'

/**
 * The listing form offers only what fits: a category's own subcategories, a
 * governorate's own districts, and opening times the "Open now" filter can
 * read. Each used to be a note in a description asking staff to get it right.
 */

type Loose = {
  name?: string
  fields?: Loose[]
  tabs?: { fields: Loose[] }[]
  filterOptions?: (args: { options: { label: string; value: string }[]; data: object }) => {
    value: string
  }[]
  validate?: (
    value: unknown,
    args: { data: object; req?: object },
  ) => true | string | Promise<true | string>
  access?: Record<string, (args: { req: { user?: unknown } }) => boolean>
}

const all = (fields: Loose[]): Loose[] =>
  fields.flatMap((f) => [
    f,
    ...(f.fields ? all(f.fields) : []),
    ...(f.tabs ? f.tabs.flatMap((tab) => all(tab.fields)) : []),
  ])
const field = (name: string) =>
  all(Businesses.fields as unknown as Loose[]).find((f) => f.name === name)!

const optionsOf = (name: string) =>
  (field(name) as unknown as { options: { label: string; value: string }[] }).options

describe('subcategories', () => {
  const sub = field('subcategories')

  it('offers only the chosen category’s subcategories', () => {
    const offered = sub.filterOptions!({
      options: optionsOf('subcategories'),
      data: { category: 'hospitality' },
    }).map((o) => o.value)
    expect(offered).toEqual(['hotels', 'getaways'])
    expect(offered).not.toContain('restaurants')
  })

  it('holds only the sixteen kinds of place, the old ones deleted before launch', () => {
    const values = optionsOf('subcategories').map((o) => o.value)
    expect(values).toHaveLength(16)
    expect(values).not.toContain('guest-houses')
    expect(values).not.toContain('hospitals')
    expect(optionsOf('category').map((o) => o.value)).not.toContain('healthcare')
  })

  it('refuses one from another category, and names it', () => {
    expect(sub.validate!(['getaways'], { data: { category: 'hospitality' } })).toBe(true)
    expect(sub.validate!(['restaurants'], { data: { category: 'hospitality' } })).toContain(
      'restaurants',
    )
    expect(sub.validate!([], { data: { category: 'hospitality' } })).toBe(true)
  })
})

describe('district', () => {
  const district = field('district')

  it('offers only the chosen governorate’s districts', () => {
    const offered = district.filterOptions!({
      options: optionsOf('district'),
      data: { governorate: 'beqaa' },
    }).map((o) => o.value)
    expect(offered.sort()).toEqual(['baalbek', 'hermel', 'rachaya', 'western-beqaa', 'zahle'])
  })

  it('refuses a district from another governorate', () => {
    expect(district.validate!('zahle', { data: { governorate: 'beqaa' } })).toBe(true)
    expect(district.validate!('tyre', { data: { governorate: 'beqaa' } })).not.toBe(true)
    expect(district.validate!(null, { data: { governorate: 'beqaa' } })).toBe(true)
  })
})

describe('opening times', () => {
  it.each(['09:00', '23:30', '00:00', '24:00', '', null])('accepts %s', (value) => {
    expect(validTime(value)).toBe(true)
  })

  it.each(['9am', '9:00', '09.00', '25:00', '12:60'])('refuses %s', (value) => {
    expect(validTime(value)).not.toBe(true)
  })

  it('is what both time fields check', () => {
    expect(field('opens').validate).toBe(validTime)
    expect(field('closes').validate).toBe(validTime)
  })
})

describe('submission fields', () => {
  const names = [
    'status',
    'ownerName',
    'ownerEmail',
    'ownerPhone',
    'publicPhone',
    'website',
    'pageTemplate',
    'submittedAt',
  ]
  const group = field('submission')
  const sub = (name: string) => (group.fields as Loose[]).find((f) => f.name === name)!

  it.each(names)('keeps %s staff-only at the field level', (name) => {
    const access = sub(name).access!
    expect(access.read!({ req: {} })).toBe(false)
    expect(access.read!({ req: { user: { collection: 'users', roles: ['staff'] } } })).toBe(true)
    expect(access.create!({ req: { user: { collection: 'users', roles: ['admin'] } } })).toBe(false)
    expect(access.update!({ req: {} })).toBe(false)
  })

  it('leaves the status empty on listings staff create (no default)', () => {
    expect(sub('status')).not.toHaveProperty('defaultValue')
  })

  it('offers the three review statuses and templates', () => {
    expect(optionsOf2(sub('status'))).toEqual(['pending', 'approved', 'rejected'])
    expect(optionsOf2(sub('pageTemplate'))).toEqual(['a', 'b', 'c'])
  })
})

function optionsOf2(f: Loose) {
  return (f as unknown as { options: { value: string }[] }).options.map((o) => o.value)
}

describe('listing number', () => {
  const number = field('listingNumber')
  const withRange = (range: object | null) => ({
    payload: { find: vi.fn(async () => ({ docs: range ? [range] : [] })) },
  })
  const data = { issue: 4, governorate: 'beirut' }

  it('accepts a number inside the range of its governorate', async () => {
    const req = withRange({ governorate: 'beirut', from: 100, to: 150 })
    expect(await number.validate!(120, { data, req })).toBe(true)
  })

  it('refuses a number outside it, naming the range', async () => {
    const req = withRange({ governorate: 'beirut', from: 100, to: 150 })
    const result = await number.validate!(151, { data, req })
    expect(result).toContain('100')
    expect(result).toContain('150')
  })

  it('accepts an empty number without looking anything up', async () => {
    const req = withRange(null)
    expect(await number.validate!(null, { data, req })).toBe(true)
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('refuses a number when the governorate has no range in that issue', async () => {
    expect(await number.validate!(5, { data, req: withRange(null) })).not.toBe(true)
  })

  it('is unique per issue', () => {
    expect(Businesses.indexes).toContainEqual({ fields: ['issue', 'listingNumber'], unique: true })
  })
})
