import { describe, expect, it, vi } from 'vitest'

vi.mock('./dashboard-stats', () => ({
  dashboardCounts: async () => ({
    publishedListings: 4,
    draftListings: 2,
    publishedArticles: 0,
    issues: 0,
    activeCodes: 0,
    recentScans: 9,
  }),
}))

const { adminHome, placeCounters } = await import('./admin-home')
const { countedKeys, queueHref } = await import('./submission-queues')

const now = new Date('2026-11-24T10:00:00.000Z')

/** A payload whose raw pool answers the one counts statement with `counts`. */
const fakePayload = (counts: Record<string, number>, fail = false) => {
  const asked: string[] = []
  const payloadCounts: unknown[] = []
  const payload = {
    find: async () => ({ docs: [], totalDocs: 0 }),
    count: async (args: unknown) => {
      payloadCounts.push(args)
      return { totalDocs: 0 }
    },
    logger: { error: vi.fn() },
    db: {
      schemaName: 'payload',
      tableNameMap: new Map([['businesses', 'businesses']]),
      pool: {
        query: async (text: string) => {
          asked.push(text)
          if (fail) throw new Error('down')
          return {
            rows: [
              Object.fromEntries(countedKeys(now).map(({ key }, i) => [`c${i}`, counts[key] ?? 0])),
            ],
          }
        },
      },
    },
  }
  return { payload: payload as never, asked, payloadCounts }
}

const staff = { id: 2, collection: 'users', roles: ['staff'] } as never

describe('admin home: contract panels', () => {
  it('keep sample listings out of the expired and expiring queries', async () => {
    const calls: { collection?: string; where?: unknown }[] = []
    const payload = {
      find: async (args: { collection?: string; where?: unknown }) => {
        calls.push(args)
        return { docs: [], totalDocs: 0 }
      },
      count: async () => ({ totalDocs: 0 }),
      logger: { error: vi.fn() },
      db: {
        schemaName: 'payload',
        tableNameMap: new Map(),
        pool: { query: async () => ({ rows: [] }) },
      },
    }
    await adminHome(payload as never, staff, now)
    const contract = calls.filter((c) => JSON.stringify(c.where ?? {}).includes('contractEndsAt'))
    expect(contract).toHaveLength(2)
    for (const c of contract) {
      expect(JSON.stringify(c.where)).toContain('{"isSample":{"not_equals":true}}')
    }
  })
})

describe('admin home: Magazine Places counters (PRD A15)', () => {
  it('shows the six counters, each linking to the list its number counts', async () => {
    const { payload } = fakePayload({
      'awaiting-downpayment': 4,
      'to-review': 3,
      'awaiting-rest': 2,
      'ready-to-publish': 1,
      refunds: 6,
      'due-within': 5,
      incomplete: 7,
    })
    const home = await adminHome(payload, staff, now)
    expect(home.places?.map((c) => [c.label, c.value])).toEqual([
      ['Awaiting downpayment', 4],
      ['To review', 3],
      ['Awaiting the rest', 2],
      ['Ready to publish', 1],
      ['Refunds to send', 6],
      ['Deadlines within 3 days', 5],
    ])
    expect(home.places?.find((c) => c.key === 'to-review')?.href).toBe(queueHref('to-review'))
    expect(home.places?.find((c) => c.key === 'due-within')?.href).toContain(
      'submission.payment.balanceDueAt',
    )
    expect(home.numbers.submissionsToReview).toBe(3)
    expect(home.numbers.incompleteForms).toBe(7)
  })

  it('reads every counter in one SQL statement, and no payload.count on the submission', async () => {
    const { payload, asked, payloadCounts } = fakePayload({})
    await adminHome(payload, staff, now)
    expect(asked).toHaveLength(1)
    expect(JSON.stringify(payloadCounts)).not.toContain('submission.status')
  })

  it('leaves the counters out, not the page, when the counts fail', async () => {
    const { payload } = fakePayload({}, true)
    const home = await adminHome(payload, staff, now)
    expect(home.places).toBeNull()
    expect(home.numbers.listingsLive).toBe(4)
  })

  it('lists To review, Refunds to send and passed deadlines on the to-do list only when there are some', async () => {
    const some = await adminHome(
      fakePayload({ 'to-review': 2, refunds: 1, overdue: 3 }).payload,
      staff,
      now,
    )
    expect(some.attention.find((a) => a.title === '2 submissions to review')?.href).toBe(
      queueHref('to-review'),
    )
    expect(some.attention.find((a) => a.title === '1 refund to send')?.href).toBe(
      queueHref('refunds'),
    )
    expect(some.attention.some((a) => a.title.startsWith('3 payment deadlines passed'))).toBe(true)
    const none = await adminHome(fakePayload({ incomplete: 4 }).payload, staff, now)
    expect(none.attention.some((a) => a.area === 'Listings')).toBe(false)
  })

  it('has no counters without counts', () => {
    expect(placeCounters(null, now)).toBeNull()
  })
})
