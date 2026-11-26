import { describe, expect, it, vi } from 'vitest'
import type { CollectionBeforeValidateHook, Payload } from 'payload'
import { bookingRequestSchema } from '@vardenia/core'
import { createBooking } from './booking-service'
import { guardBookingWrite } from '../hooks/guardBookingWrite'
import { checkRoomRequest } from './room-availability'
import { checkStayRequest } from './stay-booking'

/**
 * QA: "hotels and guest houses refuse multi-night stays with 'That booking is
 * too long'" under the default longest booking of 4 hours (the stored defaults
 * are 60 and 240 minutes). Every place a hotel or guest house stay is judged,
 * run against exactly those stored defaults.
 */

const NOW = new Date('2026-12-01T08:00:00.000Z')
const DAY = 86_400_000
const from = new Date(NOW.getTime() + 5 * DAY)
const stored = { enabled: true, minDurationMinutes: 60, maxDurationMinutes: 240, capacity: 1 }

const guestHouse = {
  id: 20,
  name: 'Beit Douma',
  _status: 'published',
  subcategories: ['getaways'],
  booking: stored,
  stay: { nightlyPrice: 150, includedGuests: 2, extraGuestFee: 25, maxGuests: 6 },
}
const hotel = {
  id: 20,
  name: 'Hotel Albergo',
  _status: 'published',
  subcategories: ['hotels'],
  booking: stored,
}
const types = [
  {
    id: 3,
    business: 20,
    name: 'Deluxe Twin',
    rooms: 5,
    sleepsAdults: 2,
    active: true,
    options: [
      { id: 'ro', breakfast: false, cancellation: 'free', payment: 'at-property', price: 100 },
    ],
  },
]

const harness = (business: Record<string, unknown>) => {
  const create = vi.fn(async () => ({ id: 3, reference: 'REF00001', status: 'pending' }))
  const find = vi.fn(async (args: { collection: string }) => {
    if (args.collection === 'room-types') return { docs: types, totalDocs: 1 }
    if (args.collection === 'room-availability') {
      return {
        docs: [{ id: 1, roomType: 3, startsOn: '2026-01-01', endsOn: '2027-12-31', rooms: 5 }],
        totalDocs: 1,
      }
    }
    return { docs: [], totalDocs: 0 }
  })
  const payload = {
    findByID: vi.fn(async () => business),
    find,
    count: vi.fn(async () => ({ totalDocs: 0 })),
    create,
  } as unknown as Payload
  return { payload, create, find }
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

describe('a multi-night stay under the stored defaults (60 to 240 minutes)', () => {
  it('is accepted by the booking service for a guest house', async () => {
    const h = harness(guestHouse)
    const outcome = await createBooking({
      payload: h.payload,
      request: request(2),
      customerId: 5,
      now: NOW,
    })
    expect(outcome).toMatchObject({ ok: true })
  })

  it('is accepted by the booking service for a hotel with rooms', async () => {
    const h = harness(hotel)
    const outcome = await createBooking({
      payload: h.payload,
      request: request(2, { rooms: [{ roomType: 3, count: 1, option: 'ro' }] }),
      customerId: 5,
      now: NOW,
    })
    expect(outcome).toMatchObject({ ok: true })
  })

  it('is accepted by the pure checks', () => {
    const interval = { start: from, end: new Date(from.getTime() + 2 * DAY) }
    expect(
      checkStayRequest({
        rules: stored,
        existing: [],
        stay: {},
        request: { interval, adults: 2, children: 0 },
        now: NOW,
      }),
    ).toEqual({ ok: true })
    expect(
      checkRoomRequest({
        rules: stored,
        types: types as never,
        existing: [],
        request: { interval, guests: 2, lines: [{ roomType: 3, count: 1, option: null }] },
        now: NOW,
      }),
    ).toEqual({ ok: true })
  })

  const guard = async (business: Record<string, unknown>, extra: Record<string, unknown>) => {
    const h = harness(business)
    return guardBookingWrite({
      data: {
        business: 20,
        customer: 5,
        partySize: 2,
        start: from.toISOString(),
        end: new Date(from.getTime() + 2 * DAY).toISOString(),
        ...extra,
      },
      req: { user: { id: 5, collection: 'customers' }, payload: h.payload },
      operation: 'create',
    } as unknown as Parameters<CollectionBeforeValidateHook>[0])
  }

  it('passes the booking guard for a guest house', async () => {
    await expect(guard(guestHouse, {})).resolves.toBeTruthy()
  })

  it('passes the booking guard for a hotel with room lines', async () => {
    await expect(
      guard(hotel, { rooms: [{ roomType: 3, count: 1, optionId: 'ro' }] }),
    ).resolves.toBeTruthy()
  })
})
