import { describe, expect, it } from 'vitest'
import type { CollectionBeforeValidateHook, Field, FieldAccess } from 'payload'
import { Bookings, bookingPriceRead } from './Bookings'
import { guardBookingWrite } from '../hooks/guardBookingWrite'

/**
 * The price a booking was quoted (Task 7). Stored once, by the booking service
 * with access overridden; read by staff, the venue it was booked at and the
 * guest who booked it; never written through the API by anybody, staff
 * included: a snapshot that can be edited is not a snapshot.
 */

const staff = { id: 1, collection: 'users', roles: ['staff'] }
const owner = { id: 7, collection: 'business-users', businesses: [10, 11] }
const otherOwner = { id: 8, collection: 'business-users', businesses: [12] }
const customer = { id: 30, collection: 'customers' }
const otherCustomer = { id: 31, collection: 'customers' }

const doc = { id: 99, business: 10, customer: 30 }

const priceField = Bookings.fields.find((field) => 'name' in field && field.name === 'price') as
  Extract<Field, { type: 'group' }> | undefined

const read = (user: unknown, d: unknown = doc) =>
  bookingPriceRead({ req: { user }, doc: d } as unknown as Parameters<FieldAccess>[0])

describe('the price group on bookings', () => {
  it('has total, currency, lines { label, amount }, nights and quotedAt', () => {
    expect(priceField?.type).toBe('group')
    const names = (priceField?.fields ?? []).flatMap((f) => ('name' in f ? [f.name] : []))
    expect(names).toEqual(['total', 'currency', 'nights', 'lines', 'quotedAt'])
    const lines = priceField?.fields.find((f) => 'name' in f && f.name === 'lines') as Extract<
      Field,
      { type: 'array' }
    >
    expect(lines.type).toBe('array')
    expect(lines.fields.flatMap((f) => ('name' in f ? [f.name] : []))).toEqual(['label', 'amount'])
  })

  it('is never created or updated through the API, by anybody', () => {
    for (const user of [staff, owner, customer, null]) {
      const args = { req: { user }, doc } as unknown as Parameters<FieldAccess>[0]
      expect(priceField?.access?.create?.(args)).toBe(false)
      expect(priceField?.access?.update?.(args)).toBe(false)
    }
  })

  it('is read by staff, by the venue of that booking and by its own guest only', () => {
    expect(read(staff)).toBe(true)
    expect(read(owner)).toBe(true)
    expect(read(customer)).toBe(true)
    expect(read(otherOwner)).toBe(false)
    expect(read(otherCustomer)).toBe(false)
    expect(read(null)).toBe(false)
    // Populated relations, as depth > 0 returns them.
    expect(read(owner, { business: { id: 10 }, customer: { id: 30 } })).toBe(true)
    expect(read(customer, { business: { id: 10 }, customer: { id: 30 } })).toBe(true)
    expect(read(otherCustomer, { business: 10, customer: { id: 30 } })).toBe(false)
    // No document to judge by: not shown.
    expect(
      bookingPriceRead({ req: { user: customer } } as unknown as Parameters<FieldAccess>[0]),
    ).toBe(false)
  })

  it('keeps the collection read rules: a customer still sees only their own bookings', () => {
    const ctx = (user: unknown) => ({ req: { user } }) as never
    expect(Bookings.access?.read?.(ctx(customer))).toEqual({ customer: { equals: 30 } })
    expect(Bookings.access?.read?.(ctx(owner))).toEqual({ business: { in: [10, 11] } })
    expect(Bookings.access?.read?.(ctx(null))).toBe(false)
  })
})

type Args = Parameters<CollectionBeforeValidateHook>[0]

const forged = { total: 1, currency: 'USD', nights: 1, lines: [{ label: 'x', amount: 1 }] }
const stored = {
  status: 'confirmed',
  customer: 30,
  business: 10,
  start: new Date(Date.now() + 86_400_000).toISOString(),
  end: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  partySize: 2,
  price: { total: 450, currency: 'USD', nights: 3, lines: [{ label: 'Nightly', amount: 450 }] },
}

const update = (user: unknown, data: Record<string, unknown>) =>
  guardBookingWrite({
    data,
    req: { user },
    operation: 'update',
    originalDoc: stored,
    context: {},
  } as unknown as Args) as Promise<Record<string, unknown>>

describe('guardBookingWrite and the price snapshot', () => {
  it.each([
    ['customer', customer],
    ['owner', owner],
    ['staff', staff],
    ['a server script', undefined],
  ])('replaces a price sent by %s on update with the stored one', async (_who, user) => {
    const out = await update(user, { price: forged })
    expect(out.price).toEqual(stored.price)
    // A copy, so nothing later in the save can change the stored object.
    expect(out.price).not.toBe(stored.price)
  })

  it('keeps the stored snapshot on a staff edit that does not send one', async () => {
    const out = await update(staff, { declineReason: 'n/a' })
    expect(out.price).toEqual(stored.price)
  })

  it('leaves a booking without a snapshot without one', async () => {
    const unpriced = Object.fromEntries(Object.entries(stored).filter(([k]) => k !== 'price'))
    const out = (await guardBookingWrite({
      data: { price: forged },
      req: { user: owner },
      operation: 'update',
      originalDoc: unpriced,
      context: {},
    } as unknown as Args)) as Record<string, unknown>
    expect(out).not.toHaveProperty('price')
  })

  it('drops a price on a create that is not the booking service', async () => {
    const data = { price: forged }
    // Staff through the admin or REST: the hook returns before the availability
    // check without a business, after dropping the price.
    const out = (await guardBookingWrite({
      data,
      req: { user: staff },
      operation: 'create',
      context: {},
    } as unknown as Args)) as Record<string, unknown>
    expect(out).not.toHaveProperty('price')
  })

  it('keeps the price the booking service sends, flagged in the server-only context', async () => {
    const out = (await guardBookingWrite({
      data: { price: { ...forged, total: 450 } },
      req: { user: undefined },
      operation: 'create',
      context: { priceSnapshot: true },
    } as unknown as Args)) as Record<string, unknown>
    expect(out.price).toMatchObject({ total: 450 })
  })
})
