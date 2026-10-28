import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import {
  NotReadyError,
  assertReady,
  createStatement,
  drawUpStatements,
  sendDrafts,
} from './statements'

/**
 * The monthly run, against a stand-in database.
 *
 * What matters is what it writes: which bookings it marks completed, which
 * lines end up on a statement, and that it never bills a venue twice or bills
 * one with no rate set. The rates here are made up for the test.
 */

// 2026-11-10, after the 8th, so October can be drawn up.
const NOW = new Date('2026-11-10T09:00:00Z')

interface Fixture {
  venues: {
    id: number
    name: string
    commission?: { rate?: number | null; waivedUntil?: string | null } | null
  }[]
  bookings: Record<number, Record<string, unknown>[]>
  /** The rate on the Commissions page. */
  defaultRate?: number | null
  existing?: number[]
  /** Booking ids already on a live statement, per venue. */
  billed?: Record<number, number[]>
}

type Bound = Record<string, Record<string, string>>

/** The date bound in a draw-up query, applied the way Postgres would. */
const withinBounds = (row: Record<string, unknown>, where: unknown): boolean =>
  ((where as { and?: Bound[] }).and ?? []).every((clause) =>
    Object.entries(clause).every(([field, test]) => {
      const value = row[field]
      if (typeof value !== 'string') return true
      if (test.less_than !== undefined && !(value < test.less_than)) return false
      return true
    }),
  )

function harness({ venues, bookings, defaultRate = null, existing = [], billed = {} }: Fixture) {
  const updates: Record<string, unknown>[] = []
  const creates: Record<string, unknown>[] = []

  const payload = {
    findGlobal: vi.fn(async () => ({ defaultRate })),
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
        const match = /"business":\{"equals":(\d+)\}/.exec(where)
        const rows = match
          ? (bookings[Number(match[1])] ?? [])
          : Object.entries(bookings).flatMap(([venue, list]) =>
              list.map((row) => ({ ...row, business: Number(venue) })),
            )
        return page(rows.filter((row) => withinBounds(row, args.where)))
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
  amount: 100,
  ...over,
})

describe('drawing up a month', () => {
  it('refuses a month whose bookings have not all had their seven days', () => {
    expect(() => assertReady('2026-10', new Date('2026-11-05T09:00:00Z'))).toThrow(NotReadyError)
    expect(() => assertReady('2026-10', NOW)).not.toThrow()
    expect(() => assertReady('October', NOW)).toThrow(NotReadyError)
  })

  it('bills the default rate of what each guest who came spent', async () => {
    const h = harness({
      defaultRate: 10,
      venues: [{ id: 1, name: 'Em Sherif' }],
      bookings: {
        1: [
          dinner(10, { amount: 120 }),
          dinner(11, { amount: 45.5 }),
          // Confirmed, never marked, ended long enough ago: counts, and is marked.
          // The venue gave no amount, so the guest's estimate is used.
          dinner(12, { status: 'confirmed', amount: null, guestAmount: 60 }),
        ],
      },
    })

    const result = await drawUpStatements(h.payload, '2026-10', NOW)

    expect(result.created).toBe(1)
    expect(result.markedCompleted).toBe(1)
    expect(h.updates).toEqual([
      expect.objectContaining({ collection: 'bookings', id: 12, data: { status: 'completed' } }),
    ])

    const data = h.creates[0]!.data as {
      status: string
      lines: { base: number; rate: number; amount: number }[]
    }
    expect(data.status).toBe('draft')
    expect(data.lines.map((line) => [line.base, line.rate, line.amount])).toEqual([
      [120, 10, 12],
      [45.5, 10, 4.55],
      [60, 10, 6],
    ])
  })

  it("uses a listing's own rate over the default", async () => {
    const h = harness({
      defaultRate: 10,
      venues: [{ id: 7, name: 'Own rate', commission: { rate: 8 } }],
      bookings: { 7: [dinner(70, { amount: 200 })] },
    })
    await drawUpStatements(h.payload, '2026-10', NOW)
    const data = h.creates[0]!.data as { lines: { amount: number }[] }
    expect(data.lines.map((line) => line.amount)).toEqual([16])
  })

  it('never bills a venue when no rate is set, and says so', async () => {
    const h = harness({
      venues: [{ id: 2, name: 'No agreement' }],
      bookings: { 2: [dinner(20)] },
    })
    const result = await drawUpStatements(h.payload, '2026-10', NOW)
    expect(result.created).toBe(0)
    expect(result.noRate).toEqual(['No agreement'])
    expect(h.creates).toHaveLength(0)
  })

  it('names a visit owed with no amount, rather than dropping it', async () => {
    const h = harness({
      defaultRate: 10,
      venues: [{ id: 8, name: 'Chez Nouna' }],
      bookings: { 8: [dinner(80, { amount: null }), dinner(81)] },
    })
    const result = await drawUpStatements(h.payload, '2026-10', NOW)
    expect(result.missingAmount).toEqual(['Chez Nouna (REF80)'])
    const data = h.creates[0]!.data as { lines: { booking: number }[] }
    expect(data.lines.map((line) => line.booking)).toEqual([81])
  })

  it('does not bill a venue twice for the same month', async () => {
    const h = harness({
      defaultRate: 10,
      venues: [{ id: 3, name: 'Already billed' }],
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
      amount: 300,
    })
    const fixture = {
      defaultRate: 10,
      venues: [{ id: 5, name: 'Hotel' }],
      bookings: { 5: [stay] },
    }

    const october = harness(fixture)
    const oct = await drawUpStatements(october.payload, '2026-10', NOW)
    expect(oct.created).toBe(0)
    expect(october.creates).toHaveLength(0)

    const november = harness(fixture)
    const nov = await drawUpStatements(
      november.payload,
      '2026-11',
      new Date('2026-12-08T09:00:00Z'),
    )
    expect(nov.created).toBe(1)
    expect(nov.markedCompleted).toBe(1)
    const data = november.creates[0]!.data as { lines: { reference: string; amount: number }[] }
    expect(data.lines).toEqual([expect.objectContaining({ reference: 'CROSSES', amount: 30 })])
  })

  it('never bills a booking that is already on a live statement', async () => {
    const h = harness({
      defaultRate: 10,
      venues: [{ id: 6, name: 'Billed before' }],
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
      defaultRate: 10,
      venues: [{ id: 4, name: 'New venue', commission: { waivedUntil: '2026-12-31' } }],
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

/**
 * F-08. "Already drawn up" used to be the answer to any unique refusal,
 * including a clash on the statement number, so a venue could be reported as
 * done when nothing had been written for it.
 */
describe('createStatement', () => {
  const refusal = () =>
    Object.assign(new Error('Value must be unique'), {
      name: 'ValidationError',
      data: { errors: [{ path: 'number', tableName: 'statements' }] },
    })

  const fakePayload = (creates: (() => unknown)[], liveAfterRefusal: number[]) => {
    let created = 0
    let looked = 0
    return {
      calls: () => ({ created, looked }),
      payload: {
        create: async () => {
          const step = creates[created++]
          return step ? step() : {}
        },
        find: async () => ({ totalDocs: liveAfterRefusal[looked++] ?? 0 }),
      } as never,
    }
  }

  const data = { business: 1, period: '2026-09', lines: [] }

  it('creates it', async () => {
    const fake = fakePayload([() => ({})], [])
    await expect(createStatement(fake.payload, data)).resolves.toBe('created')
  })

  it('says already drawn up only when that month is really there', async () => {
    const fake = fakePayload(
      [
        () => {
          throw refusal()
        },
      ],
      [1],
    )
    await expect(createStatement(fake.payload, data)).resolves.toBe('already-drawn-up')
  })

  it('tries again after a refusal that was not the month', async () => {
    const fake = fakePayload(
      [
        () => {
          throw refusal()
        },
        () => ({}),
      ],
      [0],
    )
    await expect(createStatement(fake.payload, data)).resolves.toBe('created')
    expect(fake.calls().created).toBe(2)
  })

  it('fails loudly rather than reporting a venue done when it keeps failing', async () => {
    const always = () => {
      throw refusal()
    }
    const fake = fakePayload([always, always, always], [0, 0, 0])
    await expect(createStatement(fake.payload, data)).rejects.toThrow(/unique/)
  })

  it('passes any other error straight through', async () => {
    const fake = fakePayload(
      [
        () => {
          throw new Error('database is down')
        },
      ],
      [],
    )
    await expect(createStatement(fake.payload, data)).rejects.toThrow(/database is down/)
  })
})
