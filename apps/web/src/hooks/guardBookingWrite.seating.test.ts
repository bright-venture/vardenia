import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CollectionBeforeValidateHook } from 'payload'

/**
 * Restaurant seating areas in the booking guard (Task 8, 20 November 2026).
 *
 * The per-area lock, replaced by an in-process mutex that behaves like
 * pg_advisory_xact_lock: held from the moment it is taken until the insert's
 * transaction ends, which the race test does by hand after its "insert".
 * `lockMode.off` turns it into a no-op, to show the race test fails without it.
 */
const lockMode = { off: false }
const lockCalls: (string | number)[] = []
let tail: Promise<void> = Promise.resolve()
vi.mock('../lib/booking-lock', () => ({
  lockBookingSlots: vi.fn(
    async (req: { release?: () => void }, businessId: string | number): Promise<void> => {
      lockCalls.push(businessId)
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
    },
  ),
}))

const { guardBookingWrite } = await import('./guardBookingWrite')

type Args = Parameters<CollectionBeforeValidateHook>[0]

const customer = { id: 5, collection: 'customers' }
const staff = { id: 1, collection: 'users', roles: ['staff'] }
const HOUR = 3_600_000
const start = new Date(Date.now() + 48 * HOUR)
const end = new Date(start.getTime() + 2 * HOUR)
const slot = { start: start.toISOString(), end: end.toISOString() }

const restaurant = (seatingAreas: unknown[] = [], capacity = 1) => ({
  id: 7,
  subcategories: ['restaurants'],
  booking: { enabled: true, capacity, leadTimeMinutes: 0 },
  seatingAreas,
})

const twoAreas = [
  { id: 'r1', setting: 'indoor', smoking: false, tables: 2 },
  { id: 'r2', setting: 'outdoor', smoking: true, tables: 1 },
]

const booked = (area: string | null, id: number) => ({ id, status: 'confirmed', area, ...slot })

const run = (opts: {
  data: Record<string, unknown>
  business: Record<string, unknown>
  existing?: Record<string, unknown>[]
  user?: unknown
}) => {
  const req: Record<string, unknown> & { release?: () => void } = {
    user: opts.user ?? customer,
    payload: {
      findByID: async () => opts.business,
      find: async (args: { collection: string }) =>
        args.collection === 'bookings' ? { docs: opts.existing ?? [] } : { docs: [] },
    },
  }
  held.push(req)
  return guardBookingWrite({
    data: { business: 7, customer: 5, partySize: 2, ...slot, ...opts.data },
    req,
    operation: 'create',
  } as unknown as Args)
}

/** Requests whose "transaction" ends after each test, releasing the lock. */
const held: { release?: () => void }[] = []

beforeEach(() => {
  lockMode.off = false
  lockCalls.length = 0
})

afterEach(() => {
  for (const req of held.splice(0)) req.release?.()
})

describe('a new booking at a restaurant with seating areas', () => {
  it('requires an area', async () => {
    const error = await run({ data: {}, business: restaurant(twoAreas) }).catch((e: Error) => e)
    expect((error as Error).message).toMatch(/choose where you would like to sit/i)
  })

  it('refuses an area the restaurant does not have', async () => {
    const error = await run({ data: { area: 'outdoor' }, business: restaurant(twoAreas) }).catch(
      (e: Error) => e,
    )
    expect((error as Error).message).toMatch(/seating area is not offered/i)
  })

  it('counts only bookings of the same area, against its tables', async () => {
    // Listing capacity 1 is full of other bookings; indoor has 2 tables, 1 taken.
    const existing = [booked('indoor', 1), booked('outdoor-smoking', 2), booked(null, 3)]
    await expect(
      run({ data: { area: 'indoor' }, business: restaurant(twoAreas, 1), existing }),
    ).resolves.toMatchObject({ area: 'indoor', status: 'pending' })
  })

  /**
   * The overlap refusal that fails without the per-area check: the listing's
   * own capacity (10) has room, the outdoor smoking area (1 table) does not.
   */
  it('refuses when the area is full even though the listing capacity has room', async () => {
    const error = await run({
      data: { area: 'outdoor-smoking' },
      business: restaurant(twoAreas, 10),
      existing: [booked('outdoor-smoking', 1)],
    }).catch((e: Error) => e)
    expect((error as Error).message).toMatch(/fully booked/i)
  })

  it('takes the booking lock for an area booking', async () => {
    await run({ data: { area: 'indoor' }, business: restaurant(twoAreas) })
    expect(lockCalls).toEqual([7])
  })

  it('re-checks when staff move a booking to another area', async () => {
    const req: Record<string, unknown> & { release?: () => void } = {
      user: staff,
      payload: {
        findByID: async () => restaurant(twoAreas, 10),
        find: async () => ({ docs: [booked('outdoor-smoking', 1)] }),
      },
    }
    held.push(req)
    const error = await guardBookingWrite({
      data: { area: 'outdoor-smoking' },
      req,
      operation: 'update',
      originalDoc: {
        id: 9,
        status: 'confirmed',
        business: 7,
        customer: 5,
        partySize: 2,
        area: 'indoor',
        ...slot,
      },
    } as unknown as Args).catch((e: Error) => e)
    expect((error as Error).message).toMatch(/fully booked/i)
  })
})

describe('a restaurant without seating areas (unchanged)', () => {
  it('counts every booking against the listing capacity, and stores no area', async () => {
    const data = await run({
      data: { area: 'indoor' },
      business: restaurant([], 2),
      existing: [booked(null, 1)],
    })
    expect(data).toMatchObject({ status: 'pending' })
    expect((data as Record<string, unknown>).area).toBeNull()
    const error = await run({
      data: {},
      business: restaurant([], 2),
      existing: [booked(null, 1), booked(null, 2)],
    }).catch((e: Error) => e)
    expect((error as Error).message).toMatch(/fully booked/i)
  })

  it('takes no new lock: the database trigger is the guarantee, as before', async () => {
    await run({ data: {}, business: restaurant([], 2) })
    expect(lockCalls).toEqual([])
  })
})

describe('two guests racing for the last table in an area', () => {
  /**
   * N requests for the one outdoor smoking table at once, against a store
   * that returns what has been "inserted". Each attempt runs the guard, then
   * (if allowed) inserts and "commits", which releases the lock.
   */
  const race = async (attempts: number) => {
    const rows: Record<string, unknown>[] = []
    const attempt = async (n: number) => {
      const req: Record<string, unknown> & { release?: () => void } = {
        user: customer,
        payload: {
          findByID: async () => restaurant(twoAreas, 10),
          find: async (args: { collection: string }) => {
            await new Promise((resolve) => setTimeout(resolve, 1))
            return args.collection === 'bookings' ? { docs: [...rows] } : { docs: [] }
          },
        },
      }
      try {
        await guardBookingWrite({
          data: { business: 7, customer: 5, partySize: 2, area: 'outdoor-smoking', ...slot },
          req,
          operation: 'create',
        } as unknown as Args)
        await new Promise((resolve) => setTimeout(resolve, 1))
        rows.push(booked('outdoor-smoking', 100 + n))
        return true
      } catch {
        return false
      } finally {
        req.release?.()
      }
    }
    const results = await Promise.all(Array.from({ length: attempts }, (_, n) => attempt(n)))
    return { rows, allowed: results.filter(Boolean).length }
  }

  it('lets exactly one through', async () => {
    const { rows, allowed } = await race(5)
    expect(allowed).toBe(1)
    expect(rows.length).toBe(1)
  })

  it('double-books without the lock (shows the test bites)', async () => {
    lockMode.off = true
    const { allowed } = await race(5)
    expect(allowed).toBeGreaterThan(1)
  })
})

/** Review fixes (Task 8 fix round 1). */
describe('seating areas, after review', () => {
  const staffUpdate = (opts: {
    data: Record<string, unknown>
    business: () => Record<string, unknown>
    originalArea: string | null
    existing?: Record<string, unknown>[]
  }) => {
    const req: Record<string, unknown> & { release?: () => void } = {
      user: staff,
      payload: {
        findByID: async () => opts.business(),
        find: async () => ({ docs: opts.existing ?? [] }),
      },
    }
    held.push(req)
    return guardBookingWrite({
      data: opts.data,
      req,
      operation: 'update',
      originalDoc: {
        id: 9,
        status: 'confirmed',
        business: 7,
        customer: 5,
        partySize: 2,
        area: opts.originalArea,
        ...slot,
      },
    } as unknown as Args)
  }

  it('decides on the areas read after the lock: an area removed meanwhile is refused', async () => {
    // First read (before the lock) still has the outdoor smoking area; the
    // partner's removal commits while this request waits for the lock.
    let reads = 0
    const findByID = vi.fn(async () =>
      reads++ === 0 ? restaurant(twoAreas, 10) : restaurant([twoAreas[0]], 10),
    )
    const req: Record<string, unknown> & { release?: () => void } = {
      user: customer,
      payload: { findByID, find: async () => ({ docs: [] }) },
    }
    held.push(req)
    const error = await guardBookingWrite({
      data: { business: 7, customer: 5, partySize: 2, area: 'outdoor-smoking', ...slot },
      req,
      operation: 'create',
    } as unknown as Args).catch((e: Error) => e)
    expect((error as Error).message).toMatch(/seating area is not offered/i)
    expect(findByID).toHaveBeenCalledTimes(2)
  })

  it('and fewer tables set meanwhile count', async () => {
    let reads = 0
    const shrunk = [twoAreas[0], { ...twoAreas[1], tables: 1 }]
    const wide = [twoAreas[0], { ...twoAreas[1], tables: 2 }]
    const req: Record<string, unknown> & { release?: () => void } = {
      user: customer,
      payload: {
        findByID: async () => (reads++ === 0 ? restaurant(wide, 10) : restaurant(shrunk, 10)),
        find: async () => ({ docs: [booked('outdoor-smoking', 1)] }),
      },
    }
    held.push(req)
    const error = await guardBookingWrite({
      data: { business: 7, customer: 5, partySize: 2, area: 'outdoor-smoking', ...slot },
      req,
      operation: 'create',
    } as unknown as Args).catch((e: Error) => e)
    expect((error as Error).message).toMatch(/fully booked/i)
  })

  it('clears an area set by staff on a listing without areas, on update too', async () => {
    const data = await staffUpdate({
      data: { area: 'indoor' },
      business: () => restaurant([], 5),
      originalArea: null,
    })
    expect((data as Record<string, unknown>).area).toBeNull()
  })

  it('refuses staff clearing the area of a booking at a listing with areas', async () => {
    for (const area of [null, '']) {
      const error = await staffUpdate({
        data: { area },
        business: () => restaurant(twoAreas, 10),
        originalArea: 'indoor',
      }).catch((e: Error) => e)
      expect((error as Error).message).toMatch(/keeps a seating area/i)
    }
    // Moving it to another area that has room is still fine.
    await expect(
      staffUpdate({
        data: { area: 'outdoor-smoking' },
        business: () => restaurant(twoAreas, 10),
        originalArea: 'indoor',
      }),
    ).resolves.toMatchObject({ area: 'outdoor-smoking' })
  })
})
