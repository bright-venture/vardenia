import { describe, expect, it } from 'vitest'
import type { Access, CollectionBeforeValidateHook } from 'payload'
import { guardBookingWrite } from './guardBookingWrite'
import { Bookings } from '../collections/Bookings'
import { Reviews } from '../collections/Reviews'

/**
 * The first half of the review chain: only the business can say the guest came.
 *
 * A review is allowed only for a booking marked `completed` (lib/review-service),
 * so who can reach `completed`, from where and when is what decides whether a
 * review is real. Characterisation of rules that were already enforced; none of
 * these were changed.
 */

type Args = Parameters<CollectionBeforeValidateHook>[0]

const customer = { id: 5, collection: 'customers' }
const owner = { id: 7, collection: 'business-users', businesses: [10] }
const otherOwner = { id: 8, collection: 'business-users', businesses: [99] }
const staff = { id: 1, collection: 'users', roles: ['staff'] }

const HOUR = 60 * 60 * 1000
const past = new Date(Date.now() - 24 * HOUR).toISOString()
const future = new Date(Date.now() + 24 * HOUR).toISOString()

const doc = (status: string, when = past) => ({
  status,
  customer: 5,
  business: 10,
  start: when,
  end: when,
})

const run = (user: unknown, original: Record<string, unknown>, data: Record<string, unknown>) =>
  guardBookingWrite({
    data,
    req: { user },
    operation: 'update',
    originalDoc: original,
    context: {},
  } as unknown as Args)

describe('marking a booking completed', () => {
  it('lets the business do it once the booking is over, from confirmed, with the amount', async () => {
    await expect(
      run(owner, doc('confirmed'), { status: 'completed', amount: 40 }),
    ).resolves.toBeTruthy()
  })

  it('refuses the business before the booking has happened', async () => {
    await expect(
      run(owner, doc('confirmed', future), { status: 'completed', amount: 40 }),
    ).rejects.toThrow(/not happened yet/i)
  })

  it('refuses a customer marking their own booking completed', async () => {
    await expect(
      run(customer, doc('confirmed'), { status: 'completed', amount: 40 }),
    ).rejects.toThrow(/cannot change a booking to completed/i)
  })

  it('refuses completing a request the business never confirmed', async () => {
    await expect(run(owner, doc('pending'), { status: 'completed', amount: 40 })).rejects.toThrow(
      /cannot go from pending to completed/i,
    )
  })

  it.each(['cancelled', 'no-show'])(
    'refuses bringing a %s booking back to completed',
    async (from) => {
      await expect(run(owner, doc(from), { status: 'completed', amount: 40 })).rejects.toThrow(
        /cannot go from/i,
      )
    },
  )

  it('refuses a completed booking being moved to no-show or cancelled afterwards', async () => {
    await expect(run(owner, doc('completed'), { status: 'no-show' })).rejects.toThrow(/cannot go/i)
    await expect(run(owner, doc('completed'), { status: 'cancelled' })).rejects.toThrow(
      /cannot go/i,
    )
  })

  it('does not let the business complete without saying what the guest spent', async () => {
    await expect(run(owner, doc('confirmed'), { status: 'completed' })).rejects.toThrow(/spent/i)
  })
})

describe('only the owner of the listing can reach its bookings', () => {
  const update = Bookings.access?.update as Access
  const call = (user: unknown) => update({ req: { user } } as unknown as Parameters<Access>[0])

  it('scopes an owner to the listings they manage', async () => {
    expect(await call(owner)).toEqual({ business: { in: [10] } })
    expect(await call(otherOwner)).toEqual({ business: { in: [99] } })
  })

  it('gives an owner with no listings no bookings at all', async () => {
    expect(await call({ id: 9, collection: 'business-users', businesses: [] })).toBe(false)
  })

  it('scopes a customer to their own bookings', async () => {
    expect(await call(customer)).toEqual({ customer: { equals: 5 } })
  })
})

describe('reviews are not public until published', () => {
  const read = Reviews.access?.read as Access
  const call = (user: unknown) => read({ req: { user } } as unknown as Parameters<Access>[0])

  it('gives the public published reviews only, not pending or rejected', async () => {
    expect(await call(undefined)).toEqual({ status: { equals: 'published' } })
    expect(await call(customer)).toEqual({ status: { equals: 'published' } })
  })

  it('gives staff everything, to moderate', async () => {
    expect(await call(staff)).toBe(true)
  })

  it('closes create to everyone (the /reviews route is the only door) and update to non-staff', async () => {
    const create = Reviews.access?.create as Access
    const update = Reviews.access?.update as Access
    const args = (user: unknown) => ({ req: { user } }) as unknown as Parameters<Access>[0]
    expect(await create(args(staff))).toBe(false)
    expect(await update(args(customer))).toBe(false)
    expect(await update(args(owner))).toBe(false)
    expect(await update(args(staff))).toBe(true)
  })
})
