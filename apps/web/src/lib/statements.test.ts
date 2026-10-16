import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { NotReadyError, assertReady, drawUpStatements, sendDrafts } from './statements'

/**
 * The monthly run, against a stand-in database.
 *
 * What matters is what it writes: which bookings it marks completed, which
 * lines end up on a statement, and that it never bills a venue twice or bills
 * one with no fee agreed.
 */

// 2026-11-10, after the 8th, so October can be drawn up.
const NOW = new Date('2026-11-10T09:00:00Z')

interface Fixture {
  venues: { id: number; name: string; bookingFee: Record<string, unknown> | null }[]
  bookings: Record<number, Record<string, unknown>[]>
  existing?: number[]
  /** Booking ids already on a live statement, per venue. */
  billed?: Record<number, number[]>
}

type Bound = Record<string, Record<string, string>>

/** The date bounds in a draw-up query, applied the way Postgres would. */
const withinBounds = (row: Record<string, unknown>, where: unknown): boolean =>
  ((where as { and?: Bound[] }).and ?? []).every((clause) =>
    Object.entries(clause).every(([field, test]) => {
      const value = row[field]
      if (typeof value !== 'string') return true
      if (test.greater_than_equal !== undefined && !(value >= test.greater_than_equal)) return false
      if (test.less_than !== undefined && !(value < test.less_than)) return false
      return true
    }),
  )

function harness({ venues, bookings, existing = [], billed = {} }: Fixture) {
  const updates: Record<string, unknown>[] = []
  const creates: Record<string, unknown>[] = []

  const payload = {
    find: vi.fn(async (args: { collection: string; where?: unknown; page?: number }) => {
      const page = (docs: unknown[]) => ({ docs, totalDocs: docs.length, hasNextPage: false })
      if (args.collection === 'businesses') return page(venues)
      if (args.collection === 'statements') {
        const where = JSON.stringify(args.where)
        const venue = Number(/"business":\{"equals":(\d+)\}/.exec(where)?.[1])
        // The one-per-month check names a period; the already-billed lookup does not.
        if (where.includes('"period"')) return page(existing.includes(venue) ? [{ id: 99 }] : [])
        const ids = billed[venue] ?? []
        return page(ids.length ? [{ lines: ids.map((booking) => ({ booking })) }] : [])
      }
      if (args.collection === 'bookings') {
        const where = JSON.stringify(args.where)
        const id = Number(/"business":\{"equals":(\d+)\}/.exec(where)?.[1])
        return page((bookings[id] ?? []).filter((row) => withinBounds(row, args.where)))
      }
      return page([])
    }),
    update: vi.fn(async (args: Record<string, unknown>) => {
      updates.push(args)
      return {}
    }),
    create: vi.fn(async (args: Record<string, unknown>) => {
      creates.push(args)
      return {}
    }),
  } as unknown as Payload

  return { payload, updates, creates }
}

const dinner = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  reference: `REF${id}`,
  start: '2026-10-10T17:00:00.000Z',
  end: '2026-10-10T19:00:00.000Z',
  partySize: 4,
  status: 'completed',
  ...over,
})

describe('drawing up a month', () => {
  it('refuses a month whose bookings have not all had their seven days', () => {
    expect(() => assertReady('2026-10', new Date('2026-11-05T09:00:00Z'))).toThrow(NotReadyError)
    expect(() => assertReady('2026-10', NOW)).not.toThrow()
    expect(() => assertReady('October', NOW)).toThrow(NotReadyError)
  })

  it('bills the guests who came and nobody else', async () => {
    const h = harness({
      venues: [{ id: 1, name: 'Em Sherif', bookingFee: { unit: 'guest', amount: 1, cap: 12 } }],
      bookings: {
        1: [
          dinner(10),
          dinner(11, { partySize: 14 }),
          // Confirmed, never marked, ended long enough ago: counts, and is marked.
          dinner(12, { status: 'confirmed', partySize: 2 }),
        ],
      },
    })

    const result = await drawUpStatements(h.payload, '2026-10', NOW)

    expect(result.created).toBe(1)
    expect(result.markedCompleted).toBe(1)
    expect(h.updates).toEqual([
      expect.objectContaining({ collection: 'bookings', id: 12, data: { status: 'completed' } }),
    ])

    const data = h.creates[0]!.data as { status: string; lines: { amount: number }[] }
    expect(data.status).toBe('draft')
    expect(data.lines.map((line) => line.amount)).toEqual([4, 12, 2])
  })

  it('never bills a venue with no fee agreed', async () => {
    const h = harness({
      venues: [{ id: 2, name: 'No agreement', bookingFee: { unit: 'guest' } }],
      bookings: { 2: [dinner(20)] },
    })
    const result = await drawUpStatements(h.payload, '2026-10', NOW)
    expect(result.created).toBe(0)
    expect(h.creates).toHaveLength(0)
  })

  it('does not bill a venue twice for the same month', async () => {
    const h = harness({
      venues: [{ id: 3, name: 'Already billed', bookingFee: { unit: 'guest', amount: 1 } }],
      bookings: { 3: [dinner(30)] },
      existing: [3],
    })
    const result = await drawUpStatements(h.payload, '2026-10', NOW)
    expect(result.alreadyDrawnUp).toBe(1)
    expect(h.creates).toHaveLength(0)
  })

  /**
   * The gap this rule closes: a stay from 30 October to 2 November used to be
   * too recent to count when October was drawn up, and outside November's
   * query because it started in October, so it was billed in neither.
   */
  it('bills a stay that crosses a month end exactly once, in the month it ends', async () => {
    const stay = dinner(50, {
      reference: 'CROSSES',
      start: '2026-10-30T12:00:00.000Z',
      end: '2026-11-02T09:00:00.000Z',
      partySize: 2,
      status: 'confirmed',
    })
    const fixture = {
      venues: [{ id: 5, name: 'Hotel', bookingFee: { unit: 'night', amount: 10 } }],
      bookings: { 5: [stay] },
    }

    const october = harness(fixture)
    const oct = await drawUpStatements(october.payload, '2026-10', NOW)
    expect(oct.nothingOwed).toBe(1)
    expect(october.creates).toHaveLength(0)

    const november = harness(fixture)
    const nov = await drawUpStatements(
      november.payload,
      '2026-11',
      new Date('2026-12-08T09:00:00Z'),
    )
    expect(nov.created).toBe(1)
    expect(nov.markedCompleted).toBe(1)
    const data = november.creates[0]!.data as { lines: { reference: string; quantity: number }[] }
    expect(data.lines).toEqual([expect.objectContaining({ reference: 'CROSSES', quantity: 3 })])
  })

  it('never bills a booking that is already on a live statement', async () => {
    const h = harness({
      venues: [{ id: 6, name: 'Billed before', bookingFee: { unit: 'booking', amount: 5 } }],
      bookings: { 6: [dinner(60), dinner(61)] },
      billed: { 6: [60] },
    })
    const result = await drawUpStatements(h.payload, '2026-10', NOW)
    expect(result.created).toBe(1)
    const data = h.creates[0]!.data as { lines: { booking: number }[] }
    expect(data.lines.map((line) => line.booking)).toEqual([61])
  })

  it('creates nothing when the launch offer covers the whole month', async () => {
    const h = harness({
      venues: [
        {
          id: 4,
          name: 'New venue',
          bookingFee: { unit: 'guest', amount: 1, waivedUntil: '2026-12-31' },
        },
      ],
      bookings: { 4: [dinner(40)] },
    })
    const result = await drawUpStatements(h.payload, '2026-10', NOW)
    expect(result.nothingOwed).toBe(1)
    expect(h.creates).toHaveLength(0)
  })
})

/**
 * Sending starts a venue's seven days to question a line and fifteen to pay. A
 * venue nobody at Vardenia can email must not have those clocks started
 * silently, so its draft stays a draft and is named for the team.
 */
describe('sending a month', () => {
  const sending = (owners: Record<number, string[]>) => {
    const updates: Record<string, unknown>[] = []
    const payload = {
      find: vi.fn(async (args: { collection: string; where?: unknown }) => {
        if (args.collection === 'statements') {
          return {
            docs: [
              { id: 1, business: 10 },
              { id: 2, business: 20 },
            ],
            hasNextPage: false,
          }
        }
        if (args.collection === 'business-users') {
          const venue = Number(/"in":\[(\d+)\]/.exec(JSON.stringify(args.where))?.[1])
          return { docs: (owners[venue] ?? []).map((email) => ({ email })) }
        }
        return { docs: [] }
      }),
      findByID: vi.fn(async ({ id }: { id: number }) => ({ id, name: `Venue ${id}` })),
      update: vi.fn(async (args: Record<string, unknown>) => {
        updates.push(args)
        return {}
      }),
    } as unknown as Payload
    return { payload, updates }
  }

  it('sends the drafts of venues a partner can receive', async () => {
    const h = sending({ 10: ['a@venue.lb'], 20: ['b@venue.lb'] })
    await expect(sendDrafts(h.payload, '2026-10', NOW)).resolves.toEqual({
      sent: 2,
      noRecipient: [],
    })
    expect(h.updates.map((u) => u.id)).toEqual([1, 2])
  })

  it('leaves a venue with no partner account as a draft, and names it', async () => {
    const h = sending({ 10: ['a@venue.lb'] })
    await expect(sendDrafts(h.payload, '2026-10', NOW)).resolves.toEqual({
      sent: 1,
      noRecipient: ['Venue 20'],
    })
    expect(h.updates).toEqual([expect.objectContaining({ id: 1, data: { status: 'sent' } })])
  })
})
