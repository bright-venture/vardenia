import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from 'payload'
import type { CollectionBeforeOperationHook, CollectionBeforeValidateHook } from 'payload'
import { Businesses } from './Businesses'
import { RoomTypes } from './RoomTypes'
import { guardKindFields } from '../hooks/guardKindFields'
import { guardPartnerListingWrite } from '../hooks/guardPartnerListingWrite'
import { guardRoomTypeWrite } from '../hooks/guardRoomTypeWrite'

/**
 * Guest houses sold as a whole property (Task 6, 20 November 2026): the
 * public `stay` and `features` groups, valid on getaways only, edited by the
 * owner through the partner allow-list; capacity 1 for a getaway; and room
 * types for hotels only.
 */

type Loose = {
  name?: string
  type?: string
  localized?: boolean
  required?: boolean
  defaultValue?: unknown
  maxRows?: number
  hasMany?: boolean
  options?: ({ value: string } | string)[]
  fields?: Loose[]
  tabs?: { label?: string; fields: Loose[]; admin?: { condition?: (data: object) => boolean } }[]
  access?: Record<string, unknown>
  filterOptions?: unknown
  validate?: (
    value: unknown,
    args: { data?: object; siblingData?: object },
  ) => true | string | Promise<true | string>
}

const all = (fields: Loose[]): Loose[] =>
  fields.flatMap((f) => [
    f,
    ...(f.fields ? all(f.fields) : []),
    ...(f.tabs ? f.tabs.flatMap((tab) => all(tab.fields)) : []),
  ])
const top = Businesses.fields as unknown as Loose[]
const group = (name: string) => all(top).find((f) => f.name === name && f.type === 'group')!
const sub = (parent: Loose, name: string) => all(parent.fields ?? []).find((f) => f.name === name)!

describe('the stay group', () => {
  const stay = group('stay')

  it('is public and has the fields the owner sets', () => {
    expect(stay).toBeTruthy()
    expect(stay.access?.read).toBeUndefined()
    expect(sub(stay, 'nightlyPrice').type).toBe('number')
    expect(sub(stay, 'includedGuests').type).toBe('number')
    expect(sub(stay, 'maxGuests').type).toBe('number')
    expect(sub(stay, 'extraGuestFee').defaultValue).toBe(0)
    expect(sub(stay, 'childrenCountAsGuests').defaultValue).toBe(true)
    expect(sub(stay, 'minNights').defaultValue).toBe(1)
  })

  it('has up to 10 packages with localized label and description, a price, a unit and a switch', () => {
    const packages = sub(stay, 'packages')
    expect(packages.type).toBe('array')
    expect(packages.maxRows).toBe(10)
    expect(sub(packages, 'label')).toMatchObject({ localized: true, required: true })
    expect(sub(packages, 'description')).toMatchObject({ localized: true })
    expect(sub(packages, 'price')).toMatchObject({ type: 'number', required: true })
    expect(
      (sub(packages, 'unit').options ?? []).map((o) => (typeof o === 'string' ? o : o.value)),
    ).toEqual(['per-night', 'per-stay', 'per-person-per-night'])
    expect(sub(packages, 'active').defaultValue).toBe(true)
  })

  const v = (field: string, value: unknown, siblingData: object = {}) =>
    sub(stay, field).validate!(value, { siblingData, data: { stay: siblingData } })

  it.each([
    ['nightlyPrice', 120, true],
    ['nightlyPrice', 99.99, true],
    ['nightlyPrice', null, true],
    ['nightlyPrice', -1, false],
    ['nightlyPrice', 10.005, false],
    ['extraGuestFee', 0, true],
    ['extraGuestFee', 12.5, true],
    ['extraGuestFee', -5, false],
    ['includedGuests', 2, true],
    ['includedGuests', 0, false],
    ['includedGuests', 1.5, false],
    ['minNights', 1, true],
    ['minNights', 0, false],
    ['minNights', 2.5, false],
  ])('%s = %s is valid: %s', async (field, value, ok) => {
    const result = await v(field, value)
    if (ok) expect(result).toBe(true)
    else expect(typeof result).toBe('string')
  })

  it('wants maxGuests to be a whole number at least includedGuests', async () => {
    expect(await v('maxGuests', 6, { includedGuests: 4 })).toBe(true)
    expect(await v('maxGuests', null, { includedGuests: 4 })).toBe(true)
    expect(typeof (await v('maxGuests', 3, { includedGuests: 4 }))).toBe('string')
    expect(typeof (await v('maxGuests', 4.5, {}))).toBe('string')
    expect(typeof (await v('maxGuests', 0, {}))).toBe('string')
  })

  it('checks a package price like any price', async () => {
    const price = sub(sub(stay, 'packages'), 'price')
    expect(await price.validate!(50, {})).toBe(true)
    expect(typeof (await price.validate!(-1, {}))).toBe('string')
    expect(typeof (await price.validate!(1.234, {}))).toBe('string')
  })
})

describe('the features group', () => {
  it('is six public optional checkboxes', () => {
    const features = group('features')
    expect(features.access?.read).toBeUndefined()
    expect(
      (features.fields ?? [])
        .flatMap((f) => all([f]))
        .filter((f) => f.type === 'checkbox')
        .map((f) => f.name),
    ).toEqual([
      'musicAllowed',
      'eventsHosted',
      'partiesAllowed',
      'gardenAccess',
      'barbecue',
      'pool',
    ])
  })
})

/**
 * The admin hides the Stay tab on other kinds of place, and Payload skips a
 * hidden field's validation, so "getaways only" is a collection hook that
 * runs on every save (hooks/guardKindFields).
 */
describe('getaways only (guardKindFields)', () => {
  type Args = Parameters<CollectionBeforeValidateHook>[0]
  const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
    Promise.resolve().then(() =>
      guardKindFields({
        data,
        originalDoc,
        operation: originalDoc ? 'update' : 'create',
        collection: Businesses,
        req: {},
        context: {},
      } as unknown as Args),
    )

  const pricedStay = { nightlyPrice: 120, includedGuests: 2 }

  it('saves stay and features on a getaway', async () => {
    await expect(
      run({ subcategories: ['getaways'], stay: pricedStay, features: { pool: true } }),
    ).resolves.toBeTruthy()
  })

  it.each([['restaurants'], ['hotels']])(
    'refuses a priced stay on %s, naming the field',
    async (kind) => {
      const error = await run({ subcategories: [kind], stay: pricedStay }).catch((e) => e)
      expect(error).toBeInstanceOf(ValidationError)
      expect(JSON.stringify((error as ValidationError).data)).toContain('stay')
      expect((error as ValidationError).data.errors[0]!.message).toMatch(/guest houses/i)
    },
  )

  it.each([['restaurants'], ['hotels']])('refuses a ticked feature on %s', async (kind) => {
    const error = await run({ subcategories: [kind], features: { barbecue: true } }).catch((e) => e)
    expect(error).toBeInstanceOf(ValidationError)
  })

  it('judges a PATCH by the stored kind of place', async () => {
    const error = await run({ stay: pricedStay }, { subcategories: ['restaurants'] }).catch(
      (e) => e,
    )
    expect(error).toBeInstanceOf(ValidationError)
    await expect(run({ stay: pricedStay }, { subcategories: ['getaways'] })).resolves.toBeTruthy()
  })

  it('lets every listing carry the defaults Payload fills in', async () => {
    await expect(
      run({
        subcategories: ['restaurants'],
        stay: { extraGuestFee: 0, childrenCountAsGuests: true, minNights: 1, packages: [] },
        features: { pool: false },
      }),
    ).resolves.toBeTruthy()
  })

  it('does not block a save that sends back what is already stored', async () => {
    const stored = { subcategories: ['restaurants'], stay: pricedStay, facilities: ['bar'] }
    await expect(
      run({ name: 'x', stay: { ...pricedStay }, facilities: ['bar'] }, stored),
    ).resolves.toBeTruthy()
  })

  it('refuses hotel facilities on a getaway: hotels only now (Task 5 rule, hidden tab)', async () => {
    const error = await run({ subcategories: ['getaways'], facilities: ['garden'] }).catch((e) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).data.errors[0]!.message).toMatch(/only for hotels/)
    await expect(run({ subcategories: ['hotels'], facilities: ['garden'] })).resolves.toBeTruthy()
  })

  it('refuses inconsistent guest numbers on a getaway', async () => {
    const error = await run({
      subcategories: ['getaways'],
      stay: { includedGuests: 6, maxGuests: 4 },
    }).catch((e) => e)
    expect(error).toBeInstanceOf(ValidationError)
  })

  it('refuses a listing filed as both a hotel and a getaway, for staff too', async () => {
    const sent = await run({ subcategories: ['hotels', 'getaways'] }).catch((e) => e)
    expect(sent).toBeInstanceOf(ValidationError)
    expect((sent as ValidationError).data.errors[0]).toMatchObject({ path: 'subcategories' })
    expect((sent as ValidationError).data.errors[0]!.message).toMatch(
      /both a hotel and a guest house/i,
    )
    // Already stored that way: the next save says so, whatever it changes.
    const stored = await run({ name: 'x' }, { subcategories: ['getaways', 'hotels'] }).catch(
      (e) => e,
    )
    expect(stored).toBeInstanceOf(ValidationError)
    // Fixing it is allowed.
    await expect(
      run({ subcategories: ['getaways'] }, { subcategories: ['getaways', 'hotels'] }),
    ).resolves.toBeTruthy()
  })

  it('is wired on the collection', () => {
    expect(Businesses.hooks?.beforeValidate).toContain(guardKindFields)
  })
})

describe('capacity at a guest house', () => {
  const capacity = all(top).find((f) => f.name === 'capacity')!

  it('is 1: one stay at a time, the whole property', async () => {
    expect(await capacity.validate!(1, { data: { subcategories: ['getaways'] } })).toBe(true)
    expect(await capacity.validate!(null, { data: { subcategories: ['getaways'] } })).toBe(true)
    expect(await capacity.validate!(3, { data: { subcategories: ['getaways'] } })).toMatch(
      /whole property/i,
    )
    expect(await capacity.validate!(12, { data: { subcategories: ['restaurants'] } })).toBe(true)
    expect(await capacity.validate!(0, { data: { subcategories: ['restaurants'] } })).not.toBe(true)
  })
})

describe('a partner editing their guest house (the real guard)', () => {
  type Args = Parameters<CollectionBeforeOperationHook>[0]
  const owner = { id: 5, collection: 'business-users', businesses: [10] }
  const run = (data: unknown) =>
    Promise.resolve(
      guardPartnerListingWrite({
        args: { id: 10, data, overrideAccess: false },
        operation: 'update',
        overrideAccess: false,
        collection: Businesses as never,
        context: {},
        req: {
          user: owner,
          payload: {
            findByID: vi.fn(async () => ({ id: 10, heroImage: 1 })),
            find: vi.fn(async () => ({ docs: [] })),
          },
        },
      } as unknown as Args),
    )

  const stay = {
    nightlyPrice: 180,
    includedGuests: 6,
    maxGuests: 10,
    extraGuestFee: 20,
    childrenCountAsGuests: false,
    minNights: 2,
    packages: [
      {
        id: '6740f1a2b3c4d5e6f7a8b9c0',
        label: 'Weekend with breakfast',
        description: 'Two nights and breakfast for everyone',
        price: 450,
        unit: 'per-stay',
        active: true,
      },
      // A new row has no id yet; a localized label for every language at once.
      { label: { en: 'Event day', ar: 'Event day' }, price: 900, unit: 'per-stay' },
    ],
  }

  it('saves the stay and the features', async () => {
    await expect(run({ stay, features: { pool: true, barbecue: false } })).resolves.toBeTruthy()
  })

  it.each([
    [{ stay: { ...stay, discount: 10 } }, 'stay.discount'],
    [
      { stay: { packages: [{ label: 'x', price: 1, unit: 'per-stay', secret: 1 }] } },
      'stay.packages.0.secret',
    ],
    [{ stay: { packages: [{ label: 'x', price: 1, unit: 'per-hour' }] } }, 'stay.packages.0.unit'],
    [
      { stay: { packages: [{ id: { $ne: 1 }, label: 'x', price: 1, unit: 'per-stay' }] } },
      'stay.packages.0.id',
    ],
    [{ stay: { packages: 'all' } }, 'stay.packages'],
    [{ stay: 'free' }, 'stay'],
    [{ features: { hotTub: true } }, 'features.hotTub'],
    [{ booking: { capacity: 4 } }, 'booking'],
  ])('refuses %j at %s', async (data, path) => {
    const error = await run(data).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(`"${path}"`)
  })
})

describe('room types are for hotels only', () => {
  it('offers only hotels as the listing of a room type', () => {
    const business = (RoomTypes.fields as unknown as Loose[]).find((f) => f.name === 'business')!
    expect(business.filterOptions).toEqual({ subcategories: { in: ['hotels'] } })
  })

  it.each([['getaways'], ['restaurants']])(
    'refuses to create one for %s, even for staff',
    async (kind) => {
      type Args = Parameters<CollectionBeforeValidateHook>[0]
      const error = await Promise.resolve(
        guardRoomTypeWrite({
          data: { business: 10, name: 'Whole house' },
          req: {
            user: { id: 1, collection: 'users', roles: ['staff'] },
            payload: { findByID: vi.fn(async () => ({ id: 10, subcategories: [kind] })) },
          },
          operation: 'create',
          collection: RoomTypes,
          context: {},
        } as unknown as Args),
      ).catch((e: Error) => e)
      expect((error as Error).message).toMatch(/Only hotels have room types/)
    },
  )
})
