import { describe, expect, it, vi } from 'vitest'

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: vi.fn(),
}))
vi.mock('../../../payload.config', () => ({ default: {} }))
vi.mock('../../../lib/rate-limit', () => ({
  withRateLimit: (handler: (request: Request) => Promise<Response>) => handler,
}))

import { unavailableMessage } from '../../../lib/availability'

const { GET } = await import('./route')
const { getPayload } = await import('payload')

/**
 * /booking/availability at a restaurant with seating areas (Task 8): each
 * area answered for the requested time, with its tables and how many are
 * taken; one area judged when `area` is sent. A restaurant without areas
 * answers as before, with no `areas`.
 */

const HOUR = 3_600_000
const start = new Date(Date.now() + 48 * HOUR)
const end = new Date(start.getTime() + 2 * HOUR)

const restaurant = (seatingAreas: unknown[], extra: Record<string, unknown> = {}) => ({
  id: 7,
  _status: 'published',
  subcategories: ['restaurants'],
  booking: { enabled: true, capacity: 1, leadTimeMinutes: 0 },
  seatingAreas,
  ...extra,
})
const twoAreas = [
  { id: 'a', setting: 'indoor', smoking: false, tables: 3, label: 'Hall' },
  { id: 'b', setting: 'outdoor', smoking: true, tables: 1 },
]
const booking = (area: string | null, id: number) => ({
  id,
  status: 'confirmed',
  area,
  start: start.toISOString(),
  end: end.toISOString(),
})

const ask = async (
  business: Record<string, unknown>,
  bookings: unknown[],
  params: Record<string, string> = {},
) => {
  vi.mocked(getPayload).mockResolvedValue({
    findByID: vi.fn(async () => business),
    find: vi.fn(async (args: { collection: string }) =>
      args.collection === 'bookings' ? { docs: bookings } : { docs: [] },
    ),
  } as never)
  const url = new URL('http://x/booking/availability')
  url.searchParams.set('business', '7')
  url.searchParams.set('start', start.toISOString())
  url.searchParams.set('end', end.toISOString())
  url.searchParams.set('partySize', '2')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const response = await (GET as unknown as (request: Request) => Promise<Response>)(
    new Request(url),
  )
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe('availability refusal wording', () => {
  it('is in the language asked for', async () => {
    const { body } = await ask(restaurant(twoAreas), [booking('outdoor-smoking', 1)], {
      area: 'outdoor-smoking',
      locale: 'ar',
    })
    expect(body.message).toBe(unavailableMessage('at-capacity', 'ar'))
    expect(body.message).not.toBe(unavailableMessage('at-capacity', 'en'))
  })
})

describe('availability per seating area', () => {
  it('answers every area, with tables and taken, free when any area is', async () => {
    const { body } = await ask(restaurant(twoAreas), [
      booking('outdoor-smoking', 1),
      booking('indoor', 2),
      booking(null, 3),
    ])
    expect(body.ok).toBe(true)
    expect(body.areas).toEqual([
      {
        area: 'indoor',
        setting: 'indoor',
        smoking: false,
        label: 'Hall',
        capacity: 3,
        taken: 1,
        ok: true,
      },
      {
        area: 'outdoor-smoking',
        setting: 'outdoor',
        smoking: true,
        label: null,
        capacity: 1,
        taken: 1,
        ok: false,
        reason: 'at-capacity',
      },
    ])
  })

  it('judges the area asked for', async () => {
    const full = await ask(restaurant(twoAreas), [booking('outdoor-smoking', 1)], {
      area: 'outdoor-smoking',
    })
    expect(full.body).toMatchObject({ ok: false, reason: 'at-capacity' })
    const unknown = await ask(restaurant(twoAreas), [], { area: 'outdoor' })
    expect(unknown.body).toMatchObject({ ok: false, reason: 'area-unknown' })
  })

  it('keeps the general reasons as they are', async () => {
    const { body } = await ask(
      restaurant(twoAreas, { booking: { enabled: true, leadTimeMinutes: 0, maxPartySize: 1 } }),
      [],
    )
    expect(body).toMatchObject({ ok: false, reason: 'party-too-large' })
  })

  it('a restaurant without areas answers as before, with no areas', async () => {
    const free = await ask(restaurant([]), [])
    expect(free.body).toEqual({ ok: true })
    const full = await ask(restaurant([]), [booking(null, 1)])
    expect(full.body).toMatchObject({ ok: false, reason: 'at-capacity' })
    expect(full.body.areas).toBeUndefined()
  })

  it('refuses an area key that is not one of the four', async () => {
    const { status } = await ask(restaurant(twoAreas), [], { area: 'rooftop' })
    expect(status).toBe(400)
  })
})

describe('the guest house quote and the stay interval', () => {
  const DAY = 24 * HOUR
  const getaway = (booking: Record<string, unknown> = {}) => ({
    id: 7,
    _status: 'published',
    subcategories: ['getaways'],
    booking: { enabled: true, capacity: 1, leadTimeMinutes: 0, ...booking },
    stay: { nightlyPrice: 150 },
  })
  const twoNights = {
    start: new Date(start.getTime() + 5 * DAY).toISOString(),
    end: new Date(start.getTime() + 7 * DAY).toISOString(),
  }

  it('quotes a stay the service would book', async () => {
    const { body } = await ask(getaway(), [], twoNights)
    expect(body.quote).toMatchObject({ ok: true, total: 300 })
  })

  it('does not quote when the stay has no interval (the service would refuse it)', async () => {
    // A stored check-in time that is not a time: no check-in instant, so the
    // booking service refuses the request; no price is shown for it.
    const { body } = await ask(getaway({ checkInTime: 'later' }), [], twoNights)
    expect(body).not.toHaveProperty('quote')
  })
})

/**
 * QA: a multi-night stay under the stored defaults (60 to 240 minutes) was
 * answered "That booking is too long" at a hotel. A hotel's stay is counted in
 * nights (lib/room-availability), as the booking service counts it.
 */
describe('a multi-night stay at a hotel and a guest house', () => {
  const DAY = 86_400_000
  const stored = { enabled: true, minDurationMinutes: 60, maxDurationMinutes: 240, capacity: 1 }
  const nights = {
    start: new Date(start.getTime() + 5 * DAY).toISOString(),
    end: new Date(start.getTime() + 7 * DAY).toISOString(),
  }
  const roomType = {
    id: 3,
    business: 7,
    name: 'Deluxe Twin',
    rooms: 5,
    sleepsAdults: 2,
    active: true,
    options: [
      { id: 'ro', breakfast: false, cancellation: 'free', payment: 'at-property', price: 100 },
    ],
  }

  const askNights = async (business: Record<string, unknown>) => {
    vi.mocked(getPayload).mockResolvedValue({
      findByID: vi.fn(async () => business),
      find: vi.fn(async (args: { collection: string }) => {
        if (args.collection === 'room-types') return { docs: [roomType], totalDocs: 1 }
        if (args.collection === 'room-availability') {
          return {
            docs: [{ id: 1, roomType: 3, startsOn: '2026-01-01', endsOn: '2030-12-31', rooms: 5 }],
            totalDocs: 1,
          }
        }
        return { docs: [], totalDocs: 0 }
      }),
    } as never)
    const url = new URL('http://x/booking/availability')
    url.searchParams.set('business', '7')
    url.searchParams.set('start', nights.start)
    url.searchParams.set('end', nights.end)
    url.searchParams.set('partySize', '2')
    url.searchParams.set('rooms', '3:1:ro')
    const response = await (GET as unknown as (request: Request) => Promise<Response>)(
      new Request(url),
    )
    return (await response.json()) as Record<string, unknown>
  }

  it('is free at a guest house', async () => {
    const body = await askNights({
      id: 7,
      _status: 'published',
      subcategories: ['getaways'],
      booking: stored,
      stay: { nightlyPrice: 100 },
    })
    expect(body.reason).not.toBe('too-long')
  })

  it('is not "too long" at a hotel with room types', async () => {
    const body = await askNights({
      id: 7,
      _status: 'published',
      subcategories: ['hotels'],
      booking: stored,
    })
    expect(body.reason).not.toBe('too-long')
  })
})
