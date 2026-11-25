import { describe, expect, it, vi } from 'vitest'
import { GOVERNORATES } from '@vardenia/core/regions'
import { Businesses, validTime } from './Businesses'
import { fillLocationFromMapUrl } from '../hooks/fillLocationFromMapUrl'

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
    expect(offered.sort()).toEqual([
      'baalbek',
      'chtoura',
      'hermel',
      'masnaa',
      'saghbine',
      'western-beqaa',
      'zahle',
    ])
  })

  it('takes every district the place form accepts, under the same governorate', () => {
    const values = new Set(optionsOf('district').map((o) => o.value))
    for (const gov of GOVERNORATES) {
      for (const d of gov.districts) {
        expect(values.has(d.slug), d.slug).toBe(true)
        expect(district.validate!(d.slug, { data: { governorate: gov.slug } })).toBe(true)
      }
    }
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
  const names = ['status', 'ownerName', 'ownerEmail', 'ownerPhone', 'pageTemplate', 'submittedAt']
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

  it('offers the review and form statuses, and the templates', () => {
    expect(optionsOf2(sub('status'))).toEqual([
      'incomplete',
      'abandoned',
      'awaiting_downpayment',
      'pending',
      'accepted',
      'paid',
      'lapsed',
      'approved',
      'rejected',
      'expired',
    ])
    expect(optionsOf2(sub('pageTemplate'))).toEqual(['a', 'b', 'c'])
  })
})

describe('public contact group', () => {
  const group = field('contact')
  const sub = (name: string) => (group.fields as Loose[]).find((f) => f.name === name)!
  const NAMES = [
    'phone',
    'whatsapp',
    'email',
    'instagram',
    'facebook',
    'tiktok',
    'snapchat',
    'youtube',
    'x',
    'linkedin',
  ]

  it('holds exactly the ten optional contact fields', () => {
    expect((group.fields as Loose[]).map((f) => f.name)).toEqual(NAMES)
    for (const name of NAMES) expect(sub(name)).not.toHaveProperty('required', true)
  })

  it('is readable by everyone: no field restricts reading', () => {
    expect(group.access?.read).toBeUndefined()
    for (const name of NAMES) expect(sub(name).access?.read).toBeUndefined()
  })

  it('is not a staff-only group and not under submission', () => {
    const submission = field('submission')
    const names = (submission.fields as Loose[]).map((f) => f.name)
    expect(names).not.toContain('publicPhone')
    expect(names).not.toContain('website')
    expect(names).not.toContain('contact')
  })

  it('has no website field anywhere', () => {
    expect(all(Businesses.fields as unknown as Loose[]).some((f) => f.name === 'website')).toBe(
      false,
    )
  })

  it('validates phone, email and links', async () => {
    const v = (name: string, value: unknown) => sub(name).validate!(value, { data: {} })
    expect(await v('phone', '+961 70 000 000')).toBe(true)
    expect(await v('whatsapp', 'abc')).not.toBe(true)
    expect(await v('email', 'x@y.com')).toBe(true)
    expect(await v('email', 'nope')).not.toBe(true)
    expect(await v('instagram', 'https://instagram.com/a')).toBe(true)
    expect(await v('instagram', 'javascript:alert(1)')).not.toBe(true)
    expect(await v('facebook', 'https://evil.com/x')).not.toBe(true)
    expect(await v('linkedin', null)).toBe(true)
  })

  it('turns a handle into a URL before validating', async () => {
    type Hook = (a: { value: unknown }) => unknown
    const hooks = (sub('instagram') as unknown as { hooks: { beforeValidate: Hook[] } }).hooks
    expect(hooks.beforeValidate[0]!({ value: '@cafe' })).toBe('https://instagram.com/cafe')
    expect(hooks.beforeValidate[0]!({ value: '' })).toBeUndefined()
    const x = (sub('x') as unknown as { hooks: { beforeValidate: Hook[] } }).hooks
    expect(x.beforeValidate[0]!({ value: 'cafe' })).toBe('https://x.com/cafe')
  })
})

function optionsOf2(f: Loose) {
  return (f as unknown as { options: { value: string }[] }).options.map((o) => o.value)
}

describe('listing number', () => {
  const number = field('listingNumber')
  /** A range for every query on listing-ranges; `holders` for the businesses lookup. */
  const withRange = (range: object | null, holders: object[] = []) => ({
    payload: {
      find: vi.fn(async ({ collection }: { collection: string }) => ({
        docs: collection === 'businesses' ? holders : range ? [range] : [],
      })),
    },
  })
  const beirut = { governorate: 'beirut', from: 100, to: 150 }
  const data = { issue: 4, governorate: 'beirut' }

  it('accepts a number inside the range of its governorate', async () => {
    const req = withRange(beirut)
    expect(await number.validate!(120, { data, req })).toBe(true)
  })

  it('refuses a number outside it, naming the range', async () => {
    const req = withRange(beirut)
    const result = await number.validate!(151, { data, req })
    expect(result).toContain('100')
    expect(result).toContain('150')
  })

  it('refuses a fraction inside the range', async () => {
    const req = withRange(beirut)
    expect(await number.validate!(120.5, { data, req })).toMatch(/whole number/i)
  })

  it('accepts an empty number without looking anything up', async () => {
    const req = withRange(null)
    expect(await number.validate!(null, { data, req })).toBe(true)
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('refuses a number when the governorate has no range in that issue', async () => {
    expect(await number.validate!(5, { data, req: withRange(null) })).not.toBe(true)
  })

  /**
   * The unique index alone answers "Value must be unique" on a path of two
   * columns, which tells staff nothing. The index stays the judge for races.
   */
  it('names the listing that already holds the number in this issue', async () => {
    const req = withRange(beirut, [{ id: 31, name: 'Cafe Nour' }])
    const result = await number.validate!(120, { data, req, id: 9 } as never)
    expect(result).toContain('120')
    expect(result).toContain('Cafe Nour')
    expect(result).toContain('31')
    const query = req.payload.find.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((a) => a.collection === 'businesses')!
    expect(query).toMatchObject({ limit: 1, depth: 0, overrideAccess: true, req })
    // A locale here would be written onto the shared req, changing the save's.
    expect(query).not.toHaveProperty('locale')
    const where = JSON.stringify(query.where)
    expect(where).toContain('"issue":{"equals":4}')
    expect(where).toContain('"listingNumber":{"equals":120}')
    expect(where).toContain('"id":{"not_equals":9}')
  })

  it('still answers when the holder has no name in any locale', async () => {
    const req = withRange(beirut, [{ id: 31 }])
    expect(await number.validate!(120, { data, req })).toMatch(/held by .*31/)
  })

  it('does not exclude anything on create', async () => {
    const req = withRange(beirut)
    await number.validate!(120, { data, req })
    const query = req.payload.find.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((a) => a.collection === 'businesses')!
    expect(JSON.stringify(query.where)).not.toContain('not_equals')
  })

  it('is unique per issue', () => {
    expect(Businesses.indexes).toContainEqual({ fields: ['issue', 'listingNumber'], unique: true })
  })
})

describe('address, map link and location', () => {
  const run = (name: string, value: unknown) => field(name).validate!(value, { data: {} })

  it('keeps all three public and writable by the owner (no field access rule)', () => {
    for (const name of ['address', 'mapUrl', 'location']) expect(field(name).access).toBeUndefined()
  })

  it('accepts an empty link and a Google Maps link, refuses anything else', async () => {
    expect(await run('mapUrl', '')).toBe(true)
    expect(await run('mapUrl', null)).toBe(true)
    expect(await run('mapUrl', 'https://maps.app.goo.gl/AbC')).toBe(true)
    expect(await run('mapUrl', 'https://www.google.com/maps/@33.89,35.5,15z')).toBe(true)
    expect(typeof (await run('mapUrl', 'https://google.com.evil.com/maps'))).toBe('string')
    expect(typeof (await run('mapUrl', 'http://www.google.com/maps'))).toBe('string')
  })

  /**
   * Restored in Task 4b: a point must lie within Lebanon, as before Task 4
   * (isWithinLebanon), the one rule shared with the partner guard, the branch
   * endpoint and the link hook.
   */
  it('refuses a point outside Lebanon, as before Task 4', async () => {
    expect(await run('location', null)).toBe(true)
    expect(await run('location', [35.5018, 33.8938])).toBe(true) // Beirut
    expect(await run('location', [2.35, 48.85])).toBe(
      'Coordinates fall outside Lebanon - check the lat/lng order.',
    ) // Paris
    expect(await run('location', [33.8938, 35.5018])).toBe(
      'Coordinates fall outside Lebanon - check the lat/lng order.',
    ) // swapped
    expect(typeof (await run('location', [35.5, 91]))).toBe('string')
    expect(typeof (await run('location', [181, 33.9]))).toBe('string')
    expect(await run('location', [35.5])).toBe('The location must be a longitude then a latitude.')
  })

  it('refuses a map link whose coordinates are outside Lebanon, on the link itself', async () => {
    expect(await run('mapUrl', 'https://www.google.com/maps/@48.85,2.35,15z')).toMatch(
      /outside Lebanon/,
    )
  })

  it('fills location from the link before validation', () => {
    const hooks = (Businesses.hooks as { beforeValidate: unknown[] }).beforeValidate
    expect(hooks).toContain(fillLocationFromMapUrl)
  })
})
