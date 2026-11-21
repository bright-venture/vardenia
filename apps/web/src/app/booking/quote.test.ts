import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { bookingRequestSchema } from '@vardenia/core'

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: vi.fn(),
}))
vi.mock('../../payload.config', () => ({ default: {} }))
vi.mock('../../lib/rate-limit', () => ({
  withRateLimit: (handler: (request: Request) => Promise<Response>) => handler,
}))

const { GET: availabilityGET } = await import('./availability/route')
const { GET: roomsGET } = await import('./rooms/route')
const { getPayload } = await import('payload')
const { createBooking } = await import('../../lib/booking-service')

/**
 * The quote the page shows before booking (Task 7), from /booking/availability
 * and /booking/rooms, and the proof that it is the price the booking stores
 * for the same inputs. Restaurants are never quoted.
 */

const DAY = 86_400_000
// Far enough ahead to pass the notice rules, near enough for "how far ahead".
const day = new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10)
const at = (d: string, plus: number) => new Date(new Date(`${d}T10:00:00Z`).getTime() + plus * DAY)

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
    packages: [
      { id: 'wknd', label: 'Weekend', price: 500, unit: 'per-stay', active: true },
      { id: 'old', label: 'Old', price: 10, unit: 'per-stay', active: false },
    ],
  },
}

const hotel = {
  id: 20,
  name: 'Albergo',
  _status: 'published',
  subcategories: ['hotels'],
  booking: { enabled: true },
}
const hotelTypes = [
  {
    id: 3,
    business: 20,
    name: 'Deluxe Twin',
    rooms: 5,
    sleepsAdults: 2,
    active: true,
    options: [
      { id: 'ro', cancellation: 'free', payment: 'at-property', price: 100 },
      { id: 'np', cancellation: 'free', payment: 'at-property', price: null },
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
      { id: 's', breakfast: true, cancellation: 'free', payment: 'at-property', price: 220.25 },
    ],
  },
]

const fakePayload = (business: Record<string, unknown>, types: Record<string, unknown>[] = []) => {
  const create = vi.fn(async () => ({ id: 1, reference: 'REF00001', status: 'pending' }))
  const payload = {
    findByID: vi.fn(async () => business),
    find: vi.fn(async (args: { collection: string }) => {
      if (args.collection === 'room-types') return { docs: types, totalDocs: types.length }
      if (args.collection === 'room-availability') {
        const docs = types.map((t, i) => ({
          id: i + 1,
          roomType: t.id,
          startsOn: '2020-01-01',
          endsOn: '2099-12-31',
          rooms: 5,
        }))
        return { docs, totalDocs: docs.length }
      }
      return { docs: [], totalDocs: 0 }
    }),
    create,
  }
  vi.mocked(getPayload).mockResolvedValue(payload as never)
  return { payload: payload as unknown as Payload, create }
}

const call = async (handler: unknown, url: string) => {
  const response = await (handler as (request: Request) => Promise<Response>)(
    new Request(`http://x${url}`),
  )
  return (await response.json()) as Record<string, unknown>
}

const availability = (query: Record<string, string>) =>
  call(availabilityGET, `/booking/availability?${new URLSearchParams(query)}`)

const stored = (create: ReturnType<typeof vi.fn>) => {
  const price = (
    create.mock.calls[0] as unknown as [{ data: { price?: Record<string, unknown> } }]
  )[0].data.price
  if (!price) return undefined
  return without(price, 'quotedAt')
}

const without = (value: unknown, key: string) =>
  Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k]) => k !== key))

beforeEach(() => vi.mocked(getPayload).mockReset())

describe('/booking/availability quotes a guest house', () => {
  const base = {
    business: '20',
    start: at(day, 0).toISOString(),
    end: at(day, 2).toISOString(),
    partySize: '4',
    children: '1',
  }

  it('shows the quote, and the booking stores the same price for the same inputs', async () => {
    const { payload, create } = fakePayload(getaway)
    const body = await availability(base)
    expect(body.ok).toBe(true)
    expect(body.quote).toMatchObject({ ok: true, total: 400, currency: 'USD', nights: 2 })

    await createBooking({
      payload,
      request: bookingRequestSchema.parse({ ...base, partySize: 4, children: 1 }),
      customerId: 5,
    })
    const shown = without(body.quote, 'ok')
    expect(stored(create)).toEqual(shown)
  })

  it('quotes a package, and the stored price matches', async () => {
    const { payload, create } = fakePayload(getaway)
    const body = await availability({ ...base, packageId: 'wknd' })
    expect(body.quote).toMatchObject({ ok: true, total: 600 })
    await createBooking({
      payload,
      request: bookingRequestSchema.parse({
        ...base,
        partySize: 4,
        children: 1,
        packageId: 'wknd',
      }),
      customerId: 5,
    })
    const shown = without(body.quote, 'ok')
    expect(stored(create)).toEqual(shown)
  })

  it('gives the refusal reason and its wording for an inactive package, in the language asked', async () => {
    fakePayload(getaway)
    const body = await availability({ ...base, packageId: 'old', locale: 'fr' })
    expect(body.quote).toMatchObject({ ok: false, reason: 'inactive-package' })
    expect(String((body.quote as { message: string }).message)).toMatch(/formule/)
  })

  it('says no-price when the guest house has none, without refusing the dates', async () => {
    fakePayload({ ...getaway, stay: {} })
    const body = await availability(base)
    expect(body.ok).toBe(true)
    expect(body.quote).toMatchObject({ ok: false, reason: 'no-price' })
  })

  it('never quotes a restaurant', async () => {
    fakePayload({
      ...getaway,
      subcategories: ['restaurants'],
      booking: { enabled: true, capacity: 5, maxDurationMinutes: 240 },
    })
    const start = at(day, 0)
    const body = await availability({
      business: '20',
      start: start.toISOString(),
      end: new Date(start.getTime() + 7_200_000).toISOString(),
      partySize: '2',
      packageId: 'wknd',
      rooms: '3:1',
    })
    expect(body).not.toHaveProperty('quote')
  })
})

describe('/booking/availability and /booking/rooms quote a hotel', () => {
  it('availability: quotes a selection of rooms, and the booking stores the same', async () => {
    const { payload, create } = fakePayload(hotel, hotelTypes)
    const query = {
      business: '20',
      start: at(day, 0).toISOString(),
      end: at(day, 3).toISOString(),
      partySize: '4',
      rooms: '3:1:ro,4:1:s',
    }
    const body = await availability(query)
    expect(body.quote).toMatchObject({ ok: true, total: 960.75, nights: 3 })
    await createBooking({
      payload,
      request: bookingRequestSchema.parse({
        ...query,
        partySize: 4,
        rooms: [
          { roomType: 3, count: 1, option: 'ro' },
          { roomType: 4, count: 1, option: 's' },
        ],
      }),
      customerId: 5,
    })
    const shown = without(body.quote, 'ok')
    expect(stored(create)).toEqual(shown)
  })

  it('rooms: quotes each option for one room, and a selection, equal to what is stored', async () => {
    const { payload, create } = fakePayload(hotel, hotelTypes)
    const body = await call(
      roomsGET,
      `/booking/rooms?business=20&date=${day}&nights=2&guests=3&rooms=3:2:ro,4:1:s`,
    )
    const types = body.types as {
      id: number
      options: { id: string; price: unknown; quote: Record<string, unknown> }[]
    }[]
    const twin = types.find((t) => t.id === 3)!
    expect(twin.options.map((o) => [o.id, o.price, o.quote.ok])).toEqual([
      ['ro', 100, true],
      ['np', null, false],
    ])
    expect(twin.options[0]!.quote).toMatchObject({ total: 200, nights: 2 })
    expect(twin.options[1]!.quote).toMatchObject({ reason: 'no-price' })
    expect(body.quote).toMatchObject({ ok: true, total: 840.5 })

    await createBooking({
      payload,
      request: bookingRequestSchema.parse({
        business: 20,
        start: at(day, 0).toISOString(),
        end: at(day, 2).toISOString(),
        partySize: 3,
        rooms: [
          { roomType: 3, count: 2, option: 'ro' },
          { roomType: 4, count: 1, option: 's' },
        ],
      }),
      customerId: 5,
    })
    const shown = without(body.quote, 'ok')
    expect(stored(create)).toEqual(shown)
  })

  it('rooms: a selection with an unpriced option is no-price, never a partial total', async () => {
    fakePayload(hotel, hotelTypes)
    const body = await call(
      roomsGET,
      `/booking/rooms?business=20&date=${day}&nights=2&rooms=3:1:ro,3:1:np`,
    )
    expect(body.quote).toMatchObject({ ok: false, reason: 'no-price' })
  })

  it('rooms: a malformed selection is invalid-input', async () => {
    fakePayload(hotel, hotelTypes)
    const body = await call(roomsGET, `/booking/rooms?business=20&date=${day}&nights=2&rooms=3:x`)
    expect(body.quote).toMatchObject({ ok: false, reason: 'invalid-input' })
  })

  it('rooms: no quote for a guest house or a restaurant', async () => {
    for (const subcategories of [['getaways'], ['restaurants']]) {
      fakePayload({ ...hotel, subcategories }, hotelTypes)
      const body = await call(roomsGET, `/booking/rooms?business=20&date=${day}&nights=2&rooms=3:1`)
      expect(body).not.toHaveProperty('quote')
      expect(body.types).toEqual([])
    }
  })
})
