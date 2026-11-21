import { describe, expect, it, vi } from 'vitest'
import type { CollectionBeforeValidateHook } from 'payload'
import { RoomTypes } from '../collections/RoomTypes'
import { guardRoomTypeWrite } from './guardRoomTypeWrite'

/**
 * Room type photos follow the listing's rule (Task 3): a partner attaches only
 * media they uploaded, or keeps what is already on the room type.
 */

type Args = Parameters<CollectionBeforeValidateHook>[0]

const partner = { id: 5, collection: 'business-users', businesses: [10] }
const staff = { id: 1, collection: 'users', roles: ['staff'] }

const run = (opts: {
  user: unknown
  data: Record<string, unknown>
  operation?: 'create' | 'update'
  originalDoc?: Record<string, unknown>
  media?: { id: number; uploadedBy: number | null }[]
}) => {
  const find = vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => ({
    docs: (opts.media ?? []).filter((m) => where.id.in.includes(String(m.id))),
  }))
  const findByID = vi.fn(async () => ({ id: 10, subcategories: ['hotels'] }))
  return {
    find,
    promise: Promise.resolve(
      guardRoomTypeWrite({
        data: opts.data,
        req: { user: opts.user, payload: { find, findByID } },
        operation: opts.operation ?? 'create',
        originalDoc: opts.originalDoc,
        collection: RoomTypes,
        context: {},
      } as unknown as Args),
    ),
  }
}

describe('room type photos', () => {
  it('lets a partner use photos they uploaded', async () => {
    const { promise } = run({
      user: partner,
      data: { business: 10, photos: [20, 21] },
      media: [
        { id: 20, uploadedBy: 5 },
        { id: 21, uploadedBy: 5 },
      ],
    })
    await expect(promise).resolves.toBeTruthy()
  })

  it("refuses another partner's photo", async () => {
    const { promise } = run({
      user: partner,
      data: { business: 10, photos: [20, 30] },
      media: [
        { id: 20, uploadedBy: 5 },
        { id: 30, uploadedBy: 6 },
      ],
    })
    await expect(promise).rejects.toMatchObject({ status: 403 })
  })

  it('keeps photos already on the room type', async () => {
    const { promise, find } = run({
      user: partner,
      operation: 'update',
      data: { business: 10, photos: [{ id: 1 }, 2] },
      originalDoc: { business: 10, photos: [1, 2] },
    })
    await expect(promise).resolves.toBeTruthy()
    expect(find).not.toHaveBeenCalled()
  })

  it('leaves staff free to use any photo', async () => {
    const { promise, find } = run({
      user: staff,
      data: { business: 99, photos: [30] },
      media: [{ id: 30, uploadedBy: 6 }],
    })
    await expect(promise).resolves.toBeTruthy()
    expect(find).not.toHaveBeenCalled()
  })
})

/**
 * Task 5: the owner chooses the new options and sets prices through the real
 * guard, and the guard still refuses anything that is not a room type field.
 */
describe('options and prices from the owner', () => {
  const option = { breakfast: true, cancellation: 'free', payment: 'at-property', price: 85.5 }

  it('lets the owner create a room type with the new slugs and a price', async () => {
    const { promise } = run({
      user: partner,
      data: {
        business: 10,
        name: 'Deluxe',
        views: ['sea', 'landmark-view'],
        amenities: ['wifi', 'shower', 'crib-available', 'extra-bed-available'],
        options: [option, { ...option, price: 0 }, { cancellation: 'non-refundable', price: null }],
      },
    })
    await expect(promise).resolves.toBeTruthy()
  })

  it('lets the owner update the price of an option, keeping its row id', async () => {
    const { promise } = run({
      user: partner,
      operation: 'update',
      originalDoc: { business: 10 },
      data: { options: [{ id: 'abc123', ...option, price: 99 }] },
    })
    await expect(promise).resolves.toBeTruthy()
  })

  it('refuses a view or amenity slug that does not exist', async () => {
    for (const data of [{ views: ['moon'] }, { amenities: ['jacuzzi'] }, { amenities: 'wifi!' }]) {
      const { promise } = run({ user: partner, data: { business: 10, ...data } })
      await expect(promise).rejects.toMatchObject({ status: 400 })
    }
  })

  it('does not accept an amenity as a view, or the reverse', async () => {
    const a = run({ user: partner, data: { business: 10, views: ['wifi'] } })
    await expect(a.promise).rejects.toMatchObject({ status: 400 })
    const b = run({ user: partner, data: { business: 10, amenities: ['sea'] } })
    await expect(b.promise).rejects.toMatchObject({ status: 400 })
  })

  it('refuses a key a room type does not have, at the top and inside an option', async () => {
    const top = run({ user: partner, data: { business: 10, commission: 5 } })
    await expect(top.promise).rejects.toMatchObject({ status: 400 })
    const nested = run({
      user: partner,
      data: { business: 10, options: [{ ...option, secretDiscount: 1 }] },
    })
    await expect(nested.promise).rejects.toMatchObject({ status: 400 })
  })

  it('accepts an option row id but still refuses unknown row keys beside it', async () => {
    const ok = run({
      user: partner,
      operation: 'update',
      originalDoc: { business: 10 },
      data: {
        options: [
          { id: 'row1', ...option },
          { id: 'row2', ...option },
        ],
      },
    })
    await expect(ok.promise).resolves.toBeTruthy()
    const bad = run({
      user: partner,
      operation: 'update',
      originalDoc: { business: 10 },
      data: { options: [{ id: 'row1', ...option, hidden: true }] },
    })
    await expect(bad.promise).rejects.toMatchObject({ status: 400 })
  })

  it('refuses a join field and an option sent as something else', async () => {
    const join = run({ user: partner, data: { business: 10, openDates: [1] } })
    await expect(join.promise).rejects.toMatchObject({ status: 400 })
    const rows = run({ user: partner, data: { business: 10, options: 'cheap' } })
    await expect(rows.promise).rejects.toMatchObject({ status: 400 })
  })

  it("refuses another hotel's room types, on create and on update", async () => {
    const create = run({ user: partner, data: { business: 11, options: [option] } })
    await expect(create.promise).rejects.toMatchObject({ status: 403 })
    const update = run({
      user: partner,
      operation: 'update',
      originalDoc: { business: 11 },
      data: { options: [option] },
    })
    await expect(update.promise).rejects.toMatchObject({ status: 403 })
  })

  it('leaves staff free to write any room type field', async () => {
    const { promise } = run({
      user: staff,
      data: { business: 99, options: [option], views: ['pool'], active: false },
    })
    await expect(promise).resolves.toBeTruthy()
  })
})
