import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({ getPayload: vi.fn() }))
vi.mock('../../../payload.config', () => ({ default: {} }))
vi.mock('../../../lib/rate-limit', () => ({
  withRateLimit: (handler: (request: Request) => Promise<Response>) => handler,
}))
vi.mock('../../../lib/booking-service', () => ({ closedPeriods: vi.fn(async () => []) }))
vi.mock('../../../lib/room-booking', () => ({
  roomTypesFor: vi.fn(async (_payload: unknown, ids: number[]) => {
    const map = new Map()
    for (const id of ids) {
      map.set(id, [{ id: 7, rooms: 2, sleepsAdults: 2, options: [], active: true, periods: [] }])
    }
    return map
  }),
  roomBookingsFor: vi.fn(async () => new Map()),
}))

const { GET } = await import('./route')
const { getPayload } = await import('payload')
const { roomTypesFor } = await import('../../../lib/room-booking')

/**
 * The room list of a hotel page (Task 6 review): only a hotel has rooms. A
 * getaway may still hold room types from before Task 6; a stale page must not
 * be offered rooms the booking service then refuses.
 */
describe('GET /booking/rooms', () => {
  const ask = async (subcategories: string[]) => {
    vi.mocked(getPayload).mockResolvedValue({
      findByID: vi.fn(async () => ({ id: 12, subcategories, booking: { enabled: true } })),
    } as never)
    const response = await (GET as unknown as (request: Request) => Promise<Response>)(
      new Request('http://x/booking/rooms?business=12&date=2030-06-01&nights=2&guests=2'),
    )
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }

  beforeEach(() => {
    vi.mocked(roomTypesFor).mockClear()
  })

  it('lists a hotel room types', async () => {
    const { body } = await ask(['hotels'])
    expect((body.types as unknown[]).length).toBe(1)
  })

  it.each([[['getaways']], [['hotels', 'getaways']], [['restaurants']]])(
    'lists no rooms for %j, without reading room types',
    async (subcategories) => {
      const { body } = await ask(subcategories)
      expect(body.types).toEqual([])
      expect(roomTypesFor).not.toHaveBeenCalled()
    },
  )
})
