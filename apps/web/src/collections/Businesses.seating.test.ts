import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from 'payload'
import type { CollectionBeforeOperationHook, CollectionBeforeValidateHook } from 'payload'

const lockCalls: (string | number)[] = []
vi.mock('../lib/booking-lock', () => ({
  lockBookingSlots: vi.fn(async (_req: unknown, id: string | number) => {
    lockCalls.push(id)
  }),
}))

const { Businesses } = await import('./Businesses')
const { guardKindFields } = await import('../hooks/guardKindFields')
const { guardPartnerListingWrite } = await import('../hooks/guardPartnerListingWrite')
const { protectSeatingAreaBookings } = await import('../hooks/protectSeatingAreaBookings')

/**
 * Restaurant seating areas on the listing (Task 8, 20 November 2026): the
 * public `seatingAreas` array, restaurants only, edited by the owner through
 * the partner allow-list, and never removed or shrunk under upcoming bookings.
 */

type Loose = {
  name?: string
  type?: string
  localized?: boolean
  required?: boolean
  maxRows?: number
  min?: number
  defaultValue?: unknown
  options?: ({ value: string } | string)[]
  fields?: Loose[]
  tabs?: { label?: string; fields: Loose[]; admin?: { condition?: (data: object) => boolean } }[]
  access?: Record<string, unknown>
}

const all = (fields: Loose[]): Loose[] =>
  fields.flatMap((f) => [
    f,
    ...(f.fields ? all(f.fields) : []),
    ...(f.tabs ? f.tabs.flatMap((tab) => all(tab.fields)) : []),
  ])
const top = Businesses.fields as unknown as Loose[]
const sub = (parent: Loose, name: string) => all(parent.fields ?? []).find((f) => f.name === name)!

describe('the seatingAreas field', () => {
  const field = all(top).find((f) => f.name === 'seatingAreas')!

  it('is a public array of up to 8 areas', () => {
    expect(field.type).toBe('array')
    expect(field.maxRows).toBe(8)
    expect(field.access?.read).toBeUndefined()
    const values = (sub(field, 'setting').options ?? []).map((o) =>
      typeof o === 'string' ? o : o.value,
    )
    expect(values).toEqual(['indoor', 'outdoor'])
    expect(sub(field, 'setting').required).toBe(true)
    expect(sub(field, 'smoking').type).toBe('checkbox')
    expect(sub(field, 'tables')).toMatchObject({ type: 'number', required: true, min: 1 })
    expect(sub(field, 'label')).toMatchObject({ type: 'text', localized: true })
    expect(sub(field, 'label').required).toBeFalsy()
  })

  it('sits in a tab shown for restaurants only', () => {
    const tabs = top.find((f) => f.type === 'tabs')!.tabs!
    const tab = tabs.find((t) => all(t.fields).some((f) => f.name === 'seatingAreas'))!
    expect(tab.admin?.condition?.({ subcategories: ['restaurants'] })).toBe(true)
    expect(tab.admin?.condition?.({ subcategories: ['hotels'] })).toBe(false)
  })

  it('is wired on the collection', () => {
    expect(Businesses.hooks?.beforeValidate).toContain(guardKindFields)
    expect(Businesses.hooks?.beforeValidate).toContain(protectSeatingAreaBookings)
  })
})

const areas = [
  { id: 'a1', setting: 'indoor', smoking: false, tables: 10, label: 'Hall' },
  { id: 'a2', setting: 'outdoor', smoking: true, tables: 3 },
]

describe('restaurants only (guardKindFields)', () => {
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

  it('saves areas on a restaurant, on create and on a PATCH', async () => {
    await expect(run({ subcategories: ['restaurants'], seatingAreas: areas })).resolves.toBeTruthy()
    await expect(
      run({ seatingAreas: areas }, { subcategories: ['restaurants'] }),
    ).resolves.toBeTruthy()
  })

  it.each([['hotels'], ['getaways'], ['cafes']])('refuses areas on %s', async (kind) => {
    const error = await run({ subcategories: [kind], seatingAreas: areas }).catch((e) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).data.errors[0]).toMatchObject({ path: 'seatingAreas' })
    expect((error as ValidationError).data.errors[0]!.message).toMatch(/only for restaurants/)
    // By the stored kind on a PATCH too.
    const patch = await run({ seatingAreas: areas }, { subcategories: [kind] }).catch((e) => e)
    expect(patch).toBeInstanceOf(ValidationError)
  })

  it('refuses the same area twice with a readable message', async () => {
    const error = await run({
      subcategories: ['restaurants'],
      seatingAreas: [areas[1], { ...areas[1], id: 'a3', tables: 1 }],
    }).catch((e) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).data.errors[0]!.message).toMatch(
      /"Outdoor, smoking" is listed twice/,
    )
  })

  it('refuses turning a restaurant with areas into another kind while it keeps them', async () => {
    const stored = { subcategories: ['restaurants'], seatingAreas: areas }
    const error = await run({ subcategories: ['cafes'] }, stored).catch((e) => e)
    expect(error).toBeInstanceOf(ValidationError)
    await expect(run({ subcategories: ['cafes'], seatingAreas: [] }, stored)).resolves.toBeTruthy()
  })

  it('lets any listing save no areas, and a save that sends them back unchanged', async () => {
    await expect(run({ subcategories: ['hotels'], seatingAreas: [] })).resolves.toBeTruthy()
    await expect(
      run(
        { name: 'x', seatingAreas: areas },
        { subcategories: ['restaurants'], seatingAreas: areas },
      ),
    ).resolves.toBeTruthy()
  })
})

describe('removing or shrinking an area with upcoming bookings (protectSeatingAreaBookings)', () => {
  type Args = Parameters<CollectionBeforeValidateHook>[0]
  const HOUR = 3_600_000
  const soon = Date.now() + 24 * HOUR
  const booking = (area: string, from: number) => ({
    id: from,
    area,
    status: 'confirmed',
    start: new Date(soon + from * HOUR).toISOString(),
    end: new Date(soon + (from + 2) * HOUR).toISOString(),
  })
  const stored = { id: 10, subcategories: ['restaurants'], seatingAreas: areas }

  const run = (data: Record<string, unknown>, bookings: unknown[], originalDoc = stored) => {
    const find = vi.fn(async () => ({ docs: bookings }))
    const promise = Promise.resolve().then(() =>
      protectSeatingAreaBookings({
        data,
        originalDoc,
        operation: 'update',
        collection: Businesses,
        req: { payload: { find } },
        context: {},
      } as unknown as Args),
    )
    return { promise, find }
  }

  it('refuses removing an area an upcoming booking holds, after taking the booking lock', async () => {
    lockCalls.length = 0
    const { promise, find } = run({ seatingAreas: [areas[0]] }, [booking('outdoor-smoking', 0)])
    const error = await promise.catch((e) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).data.errors[0]).toMatchObject({ path: 'seatingAreas' })
    expect((error as ValidationError).data.errors[0]!.message).toMatch(/Outdoor, smoking.*upcoming/)
    expect(lockCalls).toEqual([10])
    // Only upcoming occupying bookings of this listing are asked for.
    const where = JSON.stringify((find.mock.calls[0] as unknown as [{ where: unknown }])[0].where)
    expect(where).toContain('"business":{"equals":10}')
    expect(where).toContain('pending')
    expect(where).toContain('"end":{"greater_than"')
  })

  it('refuses fewer tables than the bookings held at one time', async () => {
    const { promise } = run({ seatingAreas: [areas[0], { ...areas[1], tables: 1 }] }, [
      booking('outdoor-smoking', 0),
      booking('outdoor-smoking', 1),
    ])
    const error = await promise.catch((e) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).data.errors[0]!.message).toMatch(/at least 2 tables/)
  })

  it('allows removing an area nobody holds, and shrinking within what is held', async () => {
    await expect(
      run({ seatingAreas: [{ ...areas[1], tables: 1 }] }, [booking('outdoor-smoking', 0)]).promise,
    ).resolves.toBeTruthy()
  })

  it('counts clearing the areas through a change of kind as removing them', async () => {
    const error = await run({ subcategories: ['cafes'], seatingAreas: [] }, [
      booking('indoor', 0),
    ]).promise.catch((e) => e)
    expect(error).toBeInstanceOf(ValidationError)
  })

  it('does nothing when the areas are not changed, or on create', async () => {
    const { promise, find } = run({ name: 'x', seatingAreas: areas }, [])
    await expect(promise).resolves.toBeTruthy()
    expect(find).not.toHaveBeenCalled()
    const created = protectSeatingAreaBookings({
      data: { subcategories: ['restaurants'], seatingAreas: areas },
      operation: 'create',
      req: { payload: { find } },
      context: {},
    } as unknown as Args)
    await expect(created).resolves.toBeTruthy()
    expect(find).not.toHaveBeenCalled()
  })
})

describe('a partner editing their seating areas (the real guard)', () => {
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
            findByID: vi.fn(async () => ({ id: 10 })),
            find: vi.fn(async () => ({ docs: [] })),
          },
        },
      } as unknown as Args),
    )

  it('saves areas with row ids, new rows and localized labels', async () => {
    await expect(
      run({
        seatingAreas: [
          {
            id: '6740f1a2b3c4d5e6f7a8b9c0',
            setting: 'indoor',
            smoking: false,
            tables: 12,
            label: 'Main hall',
          },
          { setting: 'outdoor', smoking: true, tables: 4, label: { en: 'Terrace', ar: 'Terrace' } },
        ],
      }),
    ).resolves.toBeTruthy()
  })

  it.each([
    [{ seatingAreas: [{ setting: 'indoor', tables: 2, capacity: 99 }] }, 'seatingAreas.0.capacity'],
    [{ seatingAreas: [{ setting: 'rooftop', tables: 2 }] }, 'seatingAreas.0.setting'],
    [{ seatingAreas: [{ id: { $ne: 1 }, setting: 'indoor', tables: 2 }] }, 'seatingAreas.0.id'],
    [{ seatingAreas: 'all' }, 'seatingAreas'],
    [{ booking: { capacity: 40 } }, 'booking'],
  ])('refuses %j at %s', async (data, path) => {
    const error = await run(data).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(`"${path}"`)
  })
})
