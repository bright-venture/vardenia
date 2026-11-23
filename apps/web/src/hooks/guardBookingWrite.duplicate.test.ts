import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CollectionBeforeValidateHook } from 'payload'

/**
 * The same booking sent twice with no attempt id (QA CORE-R11).
 *
 * The listing lock is an in-process mutex that behaves like
 * pg_advisory_xact_lock (held until the "transaction" ends); `lockMode.off`
 * turns it into a no-op to show the guard is only correct because of the lock.
 */
const lockMode = { off: false }
let tail: Promise<void> = Promise.resolve()
vi.mock('../lib/booking-lock', () => ({
  lockBookingSlots: vi.fn(async (req: { release?: () => void }): Promise<void> => {
    if (lockMode.off) {
      req.release = () => {}
      return
    }
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const before = tail
    tail = before.then(() => held)
    await before
    req.release = release
  }),
}))

const { guardBookingWrite } = await import('./guardBookingWrite')
const { DuplicateBookingError, duplicateOf, isTwin } = await import('../lib/duplicate-booking')

type Args = Parameters<CollectionBeforeValidateHook>[0]

const HOUR = 3_600_000
const start = new Date(Date.now() + 48 * HOUR)
const end = new Date(start.getTime() + 2 * HOUR)
const slot = { start: start.toISOString(), end: end.toISOString() }
const restaurant = {
  id: 7,
  subcategories: ['restaurants'],
  booking: { enabled: true, capacity: 10 },
}

/** Stores the bookings that have "committed". */
const db: Record<string, unknown>[] = []

const save = async (user: unknown, extra: Record<string, unknown> = {}) => {
  const req: Record<string, unknown> & { release?: () => void } = {
    user,
    payload: {
      findByID: async () => restaurant,
      find: async (args: { collection: string }) => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return args.collection === 'bookings' ? { docs: [...db] } : { docs: [] }
      },
    },
  }
  try {
    const data = await guardBookingWrite({
      data: { business: 7, customer: 5, partySize: 2, ...slot, ...extra },
      req,
      operation: 'create',
    } as unknown as Args)
    // The insert, and the commit that releases the lock.
    db.push({
      id: db.length + 1,
      business: 7,
      customer: 5,
      status: 'pending',
      partySize: 2,
      ...slot,
      ...extra,
    })
    return data
  } finally {
    req.release?.()
  }
}

beforeEach(() => {
  lockMode.off = false
  db.length = 0
})
afterEach(() => undefined)

const customer = { id: 5, collection: 'customers' }

describe('two identical requests at the same moment', () => {
  it('make one booking: the second is refused as a duplicate of the first', async () => {
    const results = await Promise.allSettled([save(customer), save(customer)])
    expect(db).toHaveLength(1)
    const refused = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    expect(refused).toHaveLength(1)
    expect(refused[0]?.reason).toBeInstanceOf(DuplicateBookingError)
    expect(duplicateOf(refused[0]?.reason)).toBe(1)
  })

  it('make two without the lock, which is what serialises them', async () => {
    lockMode.off = true
    await Promise.all([save(customer), save(customer)])
    expect(db).toHaveLength(2)
  })

  it('also catch a repeat that arrives after the first has committed', async () => {
    await save(customer)
    const error = await save(customer).catch((e: Error) => e)
    expect(error).toBeInstanceOf(DuplicateBookingError)
  })

  it('refuse with a conflict status and a plain message', async () => {
    await save(customer)
    const error = (await save(customer).catch((e: Error) => e)) as Error & { status: number }
    expect(error.status).toBe(409)
    expect(error.message).toMatch(/just made this exact booking/i)
  })

  it('leave staff entering bookings in the admin alone', async () => {
    const staff = { id: 1, collection: 'users' }
    await save(staff)
    await expect(save(staff)).resolves.toBeTruthy()
  })
})

describe('a request that is not a repeat', () => {
  it('is allowed when the party size differs', async () => {
    await save(customer)
    await expect(save(customer, { partySize: 3 })).resolves.toBeTruthy()
  })
})

describe('isTwin', () => {
  const base = { business: 7, partySize: 2, ...slot }
  it('needs the same area when one is named, rooms when sent, and the same quote', () => {
    expect(isTwin({ ...base, area: 'indoor' }, { ...base, area: 'outdoor' })).toBe(false)
    expect(isTwin({ ...base, area: 'indoor' }, { ...base, area: 'indoor' })).toBe(true)
    // No area named: the stored one may be the guard's choice.
    expect(isTwin(base, { ...base, area: 'indoor' })).toBe(true)
    expect(
      isTwin(
        { ...base, rooms: [{ roomType: 1, count: 2, optionId: 'a' }] },
        { ...base, rooms: [{ roomType: { id: 1 }, count: 1, optionId: 'a' }] },
      ),
    ).toBe(false)
    expect(isTwin({ ...base, price: { total: 100 } }, { ...base, price: { total: 120 } })).toBe(
      false,
    )
  })
})
