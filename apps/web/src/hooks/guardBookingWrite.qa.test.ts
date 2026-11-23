import { describe, expect, it } from 'vitest'
import type { CollectionBeforeValidateHook } from 'payload'
import { guardBookingWrite } from './guardBookingWrite'

/**
 * QA fixes: a refused price or date change answers with a clear 4xx (CORE-H5,
 * H9, X5), and staff cannot complete a booking that has not started (CORE-B6).
 */

type Args = Parameters<CollectionBeforeValidateHook>[0]

const customer = { id: 5, collection: 'customers' }
const owner = { id: 7, collection: 'business-users', businesses: [10] }
const staff = { id: 1, collection: 'users', roles: ['staff'] }
const HOUR = 3_600_000
const future = new Date(Date.now() + 48 * HOUR)
const futureEnd = new Date(future.getTime() + 2 * HOUR)
const past = new Date(Date.now() - 48 * HOUR)
const pastEnd = new Date(past.getTime() + 2 * HOUR)

const stored = (status: string, when: Date, until: Date) => ({
  id: 3,
  status,
  customer: 5,
  business: 10,
  partySize: 2,
  start: when.toISOString(),
  end: until.toISOString(),
  price: { total: 900, currency: 'USD', nights: 3, lines: [{ label: 'x', amount: 900 }] },
})

/** `data` is what is left after Payload strips fields; `body` is the request as sent. */
const run = (
  user: unknown,
  original: Record<string, unknown>,
  data: Record<string, unknown>,
  body?: Record<string, unknown>,
) =>
  guardBookingWrite({
    data,
    req: { user, ...(body ? { data: body } : {}) },
    operation: 'update',
    originalDoc: original,
    context: {},
  } as unknown as Args)

const refusal = async (promise: Promise<unknown>) =>
  (await promise.catch((e: Error) => e)) as Error & { status?: number }

describe('a price change is refused with a message, not a server error', () => {
  const original = stored('confirmed', future, futureEnd)

  it('refuses staff sending a different total, as a 403 with a plain message', async () => {
    const error = await refusal(run(staff, original, {}, { price: { total: 1 } }))
    expect(error.status).toBe(403)
    expect(error.message).toMatch(/price is set when the booking is made/i)
  })

  it('refuses a venue and a guest the same way', async () => {
    for (const user of [owner, customer]) {
      const error = await refusal(run(user, original, {}, { price: { total: 5 } }))
      expect(error.status, String((user as { collection: string }).collection)).toBe(403)
    }
  })

  it('refuses a changed line amount', async () => {
    const error = await refusal(
      run(staff, original, {}, { price: { lines: [{ label: 'x', amount: 1 }] } }),
    )
    expect(error.status).toBe(403)
  })

  it('still keeps the stored snapshot when the request leaves the price alone', async () => {
    const data = (await run(staff, original, { notes: 'x' }, { notes: 'x' })) as {
      price: { total: number }
    }
    expect(data.price.total).toBe(900)
  })

  it('accepts the admin form posting the same price back unchanged', async () => {
    await expect(
      run(staff, original, { notes: 'a' }, { notes: 'a', price: structuredClone(original.price) }),
    ).resolves.toBeTruthy()
  })
})

describe('a date change by a guest or a venue is refused with a message', () => {
  const original = stored('confirmed', future, futureEnd)
  const moved = new Date(future.getTime() + 24 * HOUR).toISOString()

  it('refuses the guest, as a 403 telling them to cancel and rebook', async () => {
    const error = await refusal(run(customer, original, {}, { start: moved, end: moved }))
    expect(error.status).toBe(403)
    expect(error.message).toMatch(/cannot be changed.*cancel it and make a new booking/i)
  })

  it('refuses the venue too', async () => {
    const error = await refusal(run(owner, original, {}, { end: moved }))
    expect(error.status).toBe(403)
  })

  it('accepts the same dates sent back, so cancelling from a full form still works', async () => {
    await expect(
      run(
        customer,
        original,
        { status: 'cancelled' },
        { status: 'cancelled', start: original.start, end: original.end },
      ),
    ).resolves.toBeTruthy()
  })

  it('leaves staff, who may move a booking, to the availability check', async () => {
    const error = await refusal(run(staff, original, {}, { start: moved }))
    expect(error.status).not.toBe(403)
  })
})

describe('completing a booking that has not started', () => {
  it('is refused for staff, with a message', async () => {
    const error = await refusal(
      run(staff, stored('confirmed', future, futureEnd), { status: 'completed' }),
    )
    expect(error.status).toBe(400)
    expect(error.message).toMatch(/has not started yet/i)
  })

  it('is refused for staff marking a no-show on it', async () => {
    const error = await refusal(
      run(staff, stored('confirmed', future, futureEnd), { status: 'no-show' }),
    )
    expect(error.status).toBe(400)
  })

  it('is allowed for staff once it has started, with no amount (the guest figure covers it)', async () => {
    await expect(
      run(staff, stored('confirmed', past, pastEnd), { status: 'completed' }),
    ).resolves.toBeTruthy()
  })

  it('lets staff keep correcting a booking that is already completed', async () => {
    await expect(
      run(staff, stored('completed', future, futureEnd), { notes: 'fixed' }),
    ).resolves.toBeTruthy()
  })
})
