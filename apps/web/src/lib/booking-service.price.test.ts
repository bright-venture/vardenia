import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { bookingRequestSchema } from '@vardenia/core'
import { createBooking } from './booking-service'
import { unavailableMessage } from './availability'

/**
 * The price snapshot the booking service stores (Task 7). Recomputed on the
 * server from the listing's prices at booking time; a client's price is never
 * read; a missing price stores nothing and never blocks the booking.
 */

const NOW = new Date('2026-12-01T08:00:00.000Z')
const DAY = 86_400_000
const from = new Date(NOW.getTime() + 3 * DAY)

type Created = { data: Record<string, unknown>; context?: Record<string, unknown> }
const createdOf = (create: ReturnType<typeof vi.fn>) =>
  (create.mock.calls[0] as unknown as [Created])[0]

const harness = (business: Record<string, unknown>, roomTypes: Record<string, unknown>[] = []) => {
  const create = vi.fn(async () => ({ id: 3, reference: 'REF00001', status: 'pending' }))
  const find = vi.fn(async (args: { collection: string }) => {
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
  })
  const count = vi.fn(async () => ({ totalDocs: 0 }))
  const payload = {
    findByID: vi.fn(async () => business),
    find,
    count,
    create,
  } as unknown as Payload
  return { payload, create }
}

const nightsRequest = (nights: number, extra: Record<string, unknown> = {}) =>
  bookingRequestSchema.parse({
    business: 20,
    start: from.toISOString(),
    end: new Date(from.getTime() + nights * DAY).toISOString(),
    partySize: 2,
    locale: 'en',
    ...extra,
  })

describe('price snapshot: hotel', () => {
  const hotel = {
    id: 20,
    name: 'Hotel Albergo',
    _status: 'published',
    subcategories: ['hotels'],
    booking: { enabled: true },
  }
  const types = () => [
    {
      id: 3,
      business: 20,
      name: 'Deluxe Twin',
      rooms: 5,
      sleepsAdults: 2,
      active: true,
      options: [
        { id: 'ro', breakfast: false, cancellation: 'free', payment: 'at-property', price: 100 },
        { id: 'bb', breakfast: true, cancellation: 'free', payment: 'at-property', price: 125.5 },
        { id: 'np', breakfast: false, cancellation: 'free', payment: 'at-property', price: null },
      ],
    },
    {
      id: 4,
      business: 20,
      name: 'Suite',
      rooms: 2,
      sleepsAdults: 2,
      active: true,
      options: [
        { id: 's', breakfast: true, cancellation: 'free', payment: 'at-property', price: 0 },
      ],
    },
  ]

  it('stores nights x option price x rooms over every line (multi-room, multi-night)', async () => {
    const h = harness(hotel, types())
    const outcome = await createBooking({
      payload: h.payload,
      request: nightsRequest(3, {
        partySize: 6,
        rooms: [
          { roomType: 3, count: 2, option: 'bb' },
          { roomType: 4, count: 1, option: 's' },
        ],
      }),
      customerId: 5,
      now: NOW,
    })
    expect(outcome).toMatchObject({ ok: true, total: 753 })
    const { data, context } = createdOf(h.create)
    expect(context).toMatchObject({ priceSnapshot: true })
    expect(data.price).toMatchObject({
      total: 753,
      currency: 'USD',
      nights: 3,
      quotedAt: NOW.toISOString(),
    })
    const lines = (data.price as { lines: { label: string; amount: number }[] }).lines
    expect(lines.map((l) => l.amount)).toEqual([753, 0])
    expect(lines[0]!.label).toMatch(/^2 x Deluxe Twin \(Breakfast included/)
  })

  it('stores no snapshot, and still books, when a chosen option has no price', async () => {
    const h = harness(hotel, types())
    const outcome = await createBooking({
      payload: h.payload,
      request: nightsRequest(2, {
        rooms: [
          { roomType: 3, count: 1, option: 'ro' },
          { roomType: 3, count: 1, option: 'np' },
        ],
      }),
      customerId: 5,
      now: NOW,
    })
    expect(outcome).toMatchObject({ ok: true })
    expect(outcome).not.toHaveProperty('total')
    expect(createdOf(h.create).data).not.toHaveProperty('price')
  })

  it('keeps the snapshot it stored when the hotel changes its price afterwards', async () => {
    const rooms = types()
    const h = harness(hotel, rooms)
    await createBooking({
      payload: h.payload,
      request: nightsRequest(2, { rooms: [{ roomType: 3, count: 1, option: 'ro' }] }),
      customerId: 5,
      now: NOW,
    })
    const stored = createdOf(h.create).data.price as { total: number; lines: { amount: number }[] }
    const before = JSON.parse(JSON.stringify(stored))
    // The hotel edits its price after the booking.
    ;(rooms[0]!.options[0] as { price: number }).price = 300
    expect(stored).toEqual(before)
    expect(stored.total).toBe(200)
  })
})

describe('price snapshot: guest house', () => {
  const getaway = {
    id: 20,
    name: 'Beit Douma',
    _status: 'published',
    subcategories: ['getaways'],
    booking: { enabled: true, capacity: 1 },
    stay: {
      nightlyPrice: 150,
      includedGuests: 2,
      extraGuestFee: 25,
      maxGuests: 6,
      packages: [
        { id: 'wknd', label: 'Weekend', price: 500, unit: 'per-stay', active: true },
        { id: 'old', label: 'Old', price: 10, unit: 'per-stay', active: false },
      ],
    },
  }

  it('stores the nightly quote with extra guests', async () => {
    const h = harness(getaway)
    const outcome = await createBooking({
      payload: h.payload,
      request: nightsRequest(2, { partySize: 4, children: 1 }),
      customerId: 5,
      now: NOW,
    })
    expect(outcome).toMatchObject({ ok: true, total: 400 })
    expect(createdOf(h.create).data.price).toMatchObject({
      total: 400,
      nights: 2,
      lines: [
        { label: 'Nightly price, 2 nights at $150', amount: 300 },
        { label: 'Extra guests, 2 guests x 2 nights at $25', amount: 100 },
      ],
    })
  })

  it('stores the nightly quote without extra guests', async () => {
    const h = harness(getaway)
    await createBooking({ payload: h.payload, request: nightsRequest(3), customerId: 5, now: NOW })
    expect(createdOf(h.create).data.price).toMatchObject({ total: 450, nights: 3 })
  })

  it('stores the package chosen', async () => {
    const h = harness(getaway)
    await createBooking({
      payload: h.payload,
      request: nightsRequest(2, { partySize: 3, packageId: 'wknd' }),
      customerId: 5,
      now: NOW,
    })
    expect(createdOf(h.create).data.price).toMatchObject({
      total: 550,
      lines: [
        { label: 'Weekend, per stay', amount: 500 },
        { label: 'Extra guests, 1 guest x 2 nights at $25', amount: 50 },
      ],
    })
  })

  it.each([
    ['gone', 'unknown-package'],
    ['old', 'inactive-package'],
  ] as const)(
    'refuses package %s as a bad request, never pricing it as the nightly rate',
    async (packageId, reason) => {
      const h = harness(getaway)
      const outcome = await createBooking({
        payload: h.payload,
        request: nightsRequest(2, { packageId }),
        customerId: 5,
        now: NOW,
      })
      expect(outcome).toEqual({ ok: false, code: 'invalid', message: unavailableMessage(reason) })
      expect(h.create).not.toHaveBeenCalled()
    },
  )

  it('books without a snapshot when the guest house has no price', async () => {
    const h = harness({ ...getaway, stay: { maxGuests: 6 } })
    const outcome = await createBooking({
      payload: h.payload,
      request: nightsRequest(2),
      customerId: 5,
      now: NOW,
    })
    expect(outcome).toMatchObject({ ok: true })
    expect(createdOf(h.create).data).not.toHaveProperty('price')
  })

  it('keeps the min-nights and max-guests refusals as Task 6 made them', async () => {
    const strict = { ...getaway, stay: { ...getaway.stay, minNights: 3 } }
    const short = await createBooking({
      payload: harness(strict).payload,
      request: nightsRequest(2),
      customerId: 5,
      now: NOW,
    })
    expect(short).toMatchObject({
      code: 'unavailable',
      message: unavailableMessage('below-min-nights'),
    })
    const many = await createBooking({
      payload: harness(getaway).payload,
      request: nightsRequest(2, { partySize: 7 }),
      customerId: 5,
      now: NOW,
    })
    expect(many).toMatchObject({
      code: 'unavailable',
      message: unavailableMessage('party-too-large'),
    })
  })

  it('ignores a forged client price: the schema strips it and the server quotes its own', async () => {
    const h = harness(getaway)
    const forged = nightsRequest(2, {
      price: { total: 1, currency: 'USD', nights: 2, lines: [{ label: 'cheap', amount: 1 }] },
      quote: { ok: true, total: 1 },
      total: 1,
    })
    expect(forged).not.toHaveProperty('price')
    await createBooking({ payload: h.payload, request: forged, customerId: 5, now: NOW })
    expect(createdOf(h.create).data.price).toMatchObject({ total: 300 })
  })
})

describe('price snapshot: restaurant', () => {
  it('never stores a price, even with a package id sent', async () => {
    const start = new Date(NOW.getTime() + 2 * DAY)
    const h = harness({
      id: 20,
      name: 'Em Sherif',
      _status: 'published',
      subcategories: ['restaurants'],
      booking: { enabled: true, capacity: 5, maxDurationMinutes: 240, leadTimeMinutes: 0 },
      stay: { nightlyPrice: 100 },
    })
    const outcome = await createBooking({
      payload: h.payload,
      request: bookingRequestSchema.parse({
        business: 20,
        start: start.toISOString(),
        end: new Date(start.getTime() + 7_200_000).toISOString(),
        partySize: 2,
        packageId: 'x',
      }),
      customerId: 5,
      now: NOW,
    })
    expect(outcome).toMatchObject({ ok: true })
    expect(outcome).not.toHaveProperty('total')
    const created = createdOf(h.create)
    expect(created.data).not.toHaveProperty('price')
    expect(created.context?.priceSnapshot).not.toBe(true)
  })
})
