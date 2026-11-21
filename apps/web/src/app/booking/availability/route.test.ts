import { describe, expect, it, vi } from 'vitest'

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: vi.fn(),
}))
vi.mock('../../../payload.config', () => ({ default: {} }))
vi.mock('../../../lib/rate-limit', () => ({
  withRateLimit: (handler: (request: Request) => Promise<Response>) => handler,
}))

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
