import { describe, expect, it, vi } from 'vitest'
import type { CollectionBeforeValidateHook } from 'payload'

/**
 * A hotel with room types is booked from its room lines (17 November 2026).
 * A create with no lines used to fall through to the listing's single
 * capacity: no room inventory, no price. It is refused now, for a customer or
 * the booking service; staff may still enter one in the admin. A hotel with no
 * active room type keeps booking as before.
 */

const roomTypes = { active: true }
vi.mock('../lib/room-booking', () => ({
  roomTypesFor: vi.fn(async () =>
    roomTypes.active
      ? new Map([[7, [{ id: 1, rooms: 1, sleepsAdults: 2, options: [], active: true }]]])
      : new Map(),
  ),
  roomBookingsFor: vi.fn(async () => new Map()),
}))

const { guardBookingWrite } = await import('./guardBookingWrite')
type Args = Parameters<CollectionBeforeValidateHook>[0]

const HOUR = 3_600_000
const start = new Date(Date.now() + 72 * HOUR)
const end = new Date(start.getTime() + 24 * HOUR)

const run = (
  user: unknown,
  business: Record<string, unknown>,
  captured: { where?: unknown } = {},
) =>
  guardBookingWrite({
    data: {
      business: 7,
      customer: 5,
      partySize: 2,
      start: start.toISOString(),
      end: end.toISOString(),
    },
    req: {
      user,
      payload: {
        findByID: async () => business,
        find: async (args: { collection: string; where?: unknown }) => {
          if (args.collection === 'bookings') captured.where = args.where
          return { docs: [] }
        },
      },
    },
    operation: 'create',
  } as unknown as Args)

const hotel = {
  id: 7,
  subcategories: ['hotels'],
  booking: { enabled: true, capacity: 5, leadTimeMinutes: 0, maxAdvanceDays: 365 },
}

describe('a booking with no room lines', () => {
  it('is refused at a hotel that has room types, for a customer and for no user', async () => {
    roomTypes.active = true
    await expect(run({ id: 5, collection: 'customers' }, hotel)).rejects.toThrow(/room/i)
    await expect(run(undefined, hotel)).rejects.toThrow(/room/i)
  })

  it('is allowed for staff in the admin', async () => {
    roomTypes.active = true
    await expect(run({ id: 1, collection: 'users', roles: ['staff'] }, hotel)).resolves.toBeTruthy()
  })

  it('is allowed at a hotel with no active room type', async () => {
    roomTypes.active = false
    await expect(run({ id: 5, collection: 'customers' }, hotel)).resolves.toBeTruthy()
  })

  it('counts only bookings that hold no rooms against the listing capacity', async () => {
    roomTypes.active = false
    const captured: { where?: unknown } = {}
    await run({ id: 5, collection: 'customers' }, hotel, captured)
    expect(JSON.stringify(captured.where)).toContain('roomCount')
  })
})
