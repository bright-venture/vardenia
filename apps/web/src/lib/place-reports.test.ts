import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_WEEKS,
  MAX_WEEKS,
  byWeek,
  canSeePlaceReports,
  downpaymentsKept,
  loadPlaceReports,
  moneyLines,
  parseWeeks,
  refundsOutstanding,
  weekStart,
  windowStart,
  type ReportBusiness,
} from './place-reports'

const admin = { id: 1, collection: 'users', roles: ['admin'] }
const staff = { id: 2, collection: 'users', roles: ['staff'] }

const business = (
  id: number,
  payments: NonNullable<ReportBusiness['submission']>['payments'],
  payment: NonNullable<ReportBusiness['submission']>['payment'] = {},
  extra: Partial<NonNullable<ReportBusiness['submission']>> = {},
): ReportBusiness => ({
  id,
  name: `Place ${id}`,
  submission: { reference: `VD-${id}`, payments, payment, ...extra },
})

describe('who sees the reports', () => {
  it('admins only', () => {
    expect(canSeePlaceReports(admin)).toBe(true)
    expect(canSeePlaceReports(staff)).toBe(false)
    expect(canSeePlaceReports(null)).toBe(false)
    // A partner or customer account carrying an admin role is not staff.
    expect(canSeePlaceReports({ collection: 'business-users', roles: ['admin'] })).toBe(false)
  })

  it('refuses before reading anything', async () => {
    const find = vi.fn()
    for (const user of [staff, null, { collection: 'customers', roles: ['admin'] }]) {
      expect(await loadPlaceReports({ find } as never, user)).toBeNull()
    }
    expect(find).not.toHaveBeenCalled()
  })

  it('reads as the admin, with access rules on, in two queries', async () => {
    const find = vi.fn(async () => ({ docs: [] }))
    const result = await loadPlaceReports({ find } as never, admin, {
      now: new Date('2026-11-24T10:00:00Z'),
    })
    expect(find).toHaveBeenCalledTimes(2)
    for (const [args] of find.mock.calls as unknown as [Record<string, unknown>][]) {
      expect(args.overrideAccess).toBe(false)
      expect(args.user).toBe(admin)
    }
    expect(result?.moneyWeeks).toEqual([])
    expect(result?.weeks).toBe(DEFAULT_WEEKS)
  })

  it('keeps sample listings out of the contracts query', async () => {
    const find = vi.fn(async () => ({ docs: [] }))
    await loadPlaceReports({ find } as never, admin, { now: new Date('2026-11-24T10:00:00Z') })
    const calls = find.mock.calls as unknown as [{ where?: { and?: unknown[] }; sort?: string }][]
    const contracts = calls.map(([a]) => a).find((a) => a.sort === 'contractEndsAt')!
    expect(contracts.where?.and).toContainEqual({ isSample: { not_equals: true } })
  })
})

describe('weeks', () => {
  it('start on Monday', () => {
    expect(weekStart('2026-11-24')).toBe('2026-11-23') // Tuesday
    expect(weekStart('2026-11-23')).toBe('2026-11-23') // Monday
    expect(weekStart('2026-11-29')).toBe('2026-11-23') // Sunday
    expect(weekStart('2026-03-01')).toBe('2026-02-23')
  })

  it('the window is this week and the weeks before it, in Beirut', () => {
    // 23:30 UTC on Sunday 29 Nov is Monday 30 Nov in Beirut.
    expect(windowStart(new Date('2026-11-29T23:30:00Z'), 1)).toBe('2026-11-30')
    expect(windowStart(new Date('2026-11-24T10:00:00Z'), 2)).toBe('2026-11-16')
  })

  it('?weeks= is a whole number within 1..52, else the default', () => {
    expect(parseWeeks('4')).toBe(4)
    expect(parseWeeks('500')).toBe(MAX_WEEKS)
    for (const bad of [undefined, '', '0', '-1', '2.5', 'abc', ['4']]) {
      expect(parseWeeks(bad)).toBe(DEFAULT_WEEKS)
    }
  })
})

describe('money entries', () => {
  const rows = [
    business(1, [
      {
        type: 'downpayment',
        amount: 500,
        senderNumber: '+96171000001',
        whishAt: '2026-11-17T08:00:00Z',
        method: 'whish',
        recordedBy: { name: 'Rana' },
      },
      { type: 'balance', amount: 500, whishAt: '2026-11-24T09:00:00Z', method: 'whish' },
      // Undone: never in the report.
      { type: 'balance', amount: 999, whishAt: '2026-11-24T09:30:00Z', voided: true },
    ]),
    business(2, [
      { type: 'downpayment', amount: 250.5, recordedAt: '2026-11-18T12:00:00Z', method: 'cash' },
      { type: 'refund', amount: 250.5, whishAt: '2026-11-25T12:00:00Z' },
      // Before the window.
      { type: 'downpayment', amount: 10, whishAt: '2026-11-01T12:00:00Z' },
    ]),
  ]

  it('leave out undone lines and lines before the window, and use the Whish time first', () => {
    const lines = moneyLines(rows, '2026-11-16')
    expect(lines.map((l) => [l.name, l.type, l.amount, l.day])).toEqual([
      ['Place 1', 'downpayment', 500, '2026-11-17'],
      ['Place 2', 'downpayment', 250.5, '2026-11-18'],
      ['Place 1', 'balance', 500, '2026-11-24'],
      ['Place 2', 'refund', 250.5, '2026-11-25'],
    ])
    expect(lines[0]!.senderNumber).toBe('+96171000001')
    expect(lines[0]!.recordedBy).toBe('Rana')
    expect(lines[0]!.reference).toBe('VD-1')
  })

  it('total each week, received apart from refunded, newest week first', () => {
    const weeks = byWeek(moneyLines(rows, '2026-11-16'))
    expect(weeks.map((w) => [w.start, w.received, w.refunded, w.lines.length])).toEqual([
      ['2026-11-23', 500, 250.5, 2],
      ['2026-11-16', 750.5, 0, 2],
    ])
  })

  it('count the Beirut day, not the UTC one', () => {
    // Sunday 22:30 UTC is Monday 00:30 in Beirut (UTC+2): the next week.
    const lines = moneyLines(
      [business(3, [{ type: 'downpayment', amount: 1, whishAt: '2026-11-22T22:30:00Z' }])],
      '2026-11-01',
    )
    expect(lines[0]!.day).toBe('2026-11-23')
    expect(byWeek(lines)[0]!.start).toBe('2026-11-23')
  })
})

describe('refunds outstanding and downpayments kept', () => {
  it('a refund owed is what was received less what went back, oldest first', () => {
    const owed = refundsOutstanding([
      business(
        1,
        [],
        { stage: 'refund_due', received: 500, refunded: 200 },
        {
          rejectedAt: '2026-11-20T00:00:00Z',
        },
      ),
      business(
        2,
        [],
        { stage: 'refund_due', received: 500, refunded: 0 },
        {
          rejectedAt: '2026-11-10T00:00:00Z',
        },
      ),
      business(3, [], { stage: 'refunded', received: 500, refunded: 500 }),
    ])
    expect(owed.map((o) => [o.name, o.amount])).toEqual([
      ['Place 2', 500],
      ['Place 1', 300],
    ])
  })

  it('kept is the forfeited lines, not undone ones; else the recorded total', () => {
    const kept = downpaymentsKept([
      business(
        1,
        [
          { type: 'downpayment', amount: 500, forfeited: true },
          { type: 'balance', amount: 100, forfeited: true, voided: true },
        ],
        { stage: 'kept', received: 500 },
      ),
      business(2, [], { stage: 'kept', received: 300 }),
      business(3, [{ type: 'downpayment', amount: 500, forfeited: true }], { stage: 'refund_due' }),
    ])
    expect(kept.map((k) => [k.name, k.amount]).sort()).toEqual([
      ['Place 1', 500],
      ['Place 2', 300],
    ])
  })
})
