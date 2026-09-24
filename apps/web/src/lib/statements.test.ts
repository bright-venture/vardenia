import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { NotReadyError, assertReady, drawUpStatements } from './statements'

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
}

function harness({ venues, bookings, existing = [] }: Fixture) {
  const updates: Record<string, unknown>[] = []
  const creates: Record<string, unknown>[] = []

  const payload = {
    find: vi.fn(async (args: { collection: string; where?: unknown; page?: number }) => {
      const page = (docs: unknown[]) => ({ docs, totalDocs: docs.length, hasNextPage: false })
      if (args.collection === 'businesses') return page(venues)
      if (args.collection === 'statements') {
        const where = JSON.stringify(args.where)
        const taken = existing.some((id) => where.includes(`"business":{"equals":${id}}`))
        return page(taken ? [{ id: 99 }] : [])
      }
      if (args.collection === 'bookings') {
        const where = JSON.stringify(args.where)
        const id = Number(/"business":\{"equals":(\d+)\}/.exec(where)?.[1])
        return page(bookings[id] ?? [])
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
