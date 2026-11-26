import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { bookingRequestSchema } from '@vardenia/core'
import { createBooking } from './booking-service'
import { DuplicateBookingError } from './duplicate-booking'

/**
 * An identical request the booking guard refused as a duplicate (QA CORE-R11)
 * is answered with the booking it duplicates, on every path, and as a replay,
 * so the route sends no second confirmation.
 */

const NOW = new Date('2026-12-01T08:00:00.000Z')
const DAY = 86_400_000
const from = new Date(NOW.getTime() + 3 * DAY)
const FIRST = { id: 41, reference: 'FIRST001', status: 'pending', price: { total: 240 } }

const harness = (business: Record<string, unknown>, roomTypes: Record<string, unknown>[] = []) => {
  const create = vi.fn(async () => {
    throw new DuplicateBookingError(41)
  })
  const payload = {
    findByID: vi.fn(async (args: { collection: string }) =>
      args.collection === 'bookings' ? FIRST : business,
    ),
    find: vi.fn(async (args: { collection: string }) => {
      if (args.collection === 'room-types') return { docs: roomTypes, totalDocs: roomTypes.length }
      if (args.collection === 'room-availability') {
        const docs = roomTypes.map((type, i) => ({
          id: i + 1,
          roomType: type.id,
          startsOn: '2026-01-01',
          endsOn: '2027-12-31',
          rooms: 5,
        }))
        return { docs, totalDocs: docs.length }
      }
      return { docs: [], totalDocs: 0 }
    }),
    count: vi.fn(async () => ({ totalDocs: 0 })),
    create,
  } as unknown as Payload
  return { payload, create }
}

const request = (nights: number, extra: Record<string, unknown> = {}) =>
  bookingRequestSchema.parse({
    business: 20,
    start: from.toISOString(),
    end: new Date(from.getTime() + nights * DAY).toISOString(),
    partySize: 2,
    locale: 'en',
    ...extra,
  })

const expectReplay = (outcome: unknown) =>
  expect(outcome).toMatchObject({
    ok: true,
    replayed: true,
    bookingId: 41,
    reference: 'FIRST001',
    total: 240,
  })

describe('a duplicate refused by the guard, with no attempt id', () => {
  it('replays the first booking for a restaurant table', async () => {
    const h = harness({
      id: 20,
      name: 'Em Sherif',
      _status: 'published',
      subcategories: ['restaurants'],
      booking: { enabled: true, capacity: 5, leadTimeMinutes: 0 },
    })
    const outcome = await createBooking({
      payload: h.payload,
      request: bookingRequestSchema.parse({
        business: 20,
        start: from.toISOString(),
        end: new Date(from.getTime() + 2 * 3_600_000).toISOString(),
        partySize: 2,
        locale: 'en',
      }),
      customerId: 5,
      now: NOW,
    })
    expectReplay(outcome)
    expect(h.create).toHaveBeenCalledTimes(1)
  })

  it('replays the first booking for a hotel room', async () => {
    const h = harness(
      {
        id: 20,
        name: 'Hotel Albergo',
        _status: 'published',
        subcategories: ['hotels'],
        booking: { enabled: true },
      },
      [
        {
          id: 3,
          business: 20,
          name: 'Deluxe Twin',
          rooms: 5,
          sleepsAdults: 2,
          active: true,
          options: [
            {
              id: 'ro',
              breakfast: false,
              cancellation: 'free',
              payment: 'at-property',
              price: 100,
            },
          ],
        },
      ],
    )
    const outcome = await createBooking({
      payload: h.payload,
      request: request(2, { rooms: [{ roomType: 3, count: 1, option: 'ro' }] }),
      customerId: 5,
      now: NOW,
    })
    expectReplay(outcome)
  })

  it('replays the first booking for a guest house stay', async () => {
    const h = harness({
      id: 20,
      name: 'Beit Douma',
      _status: 'published',
      subcategories: ['getaways'],
      booking: { enabled: true, capacity: 1 },
      stay: { nightlyPrice: 150, includedGuests: 2, extraGuestFee: 25, maxGuests: 6 },
    })
    const outcome = await createBooking({
      payload: h.payload,
      request: request(2),
      customerId: 5,
      now: NOW,
    })
    expectReplay(outcome)
  })
})
