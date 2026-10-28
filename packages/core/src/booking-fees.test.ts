import { describe, expect, it } from 'vitest'
import {
  AUTO_COMPLETE_DAYS,
  canDispute,
  billableAmount,
  commissionFor,
  countsAsCompleted,
  effectiveRate,
  hasCommission,
  periodBounds,
  previousPeriod,
  statementDeadlines,
  statementNumber,
  statementReadyOn,
  statementState,
  statementTotals,
  type BillableBooking,
} from './booking-fees'

const NOW = new Date('2026-11-08T10:00:00Z')

const booking = (over: Partial<BillableBooking> = {}): BillableBooking => ({
  start: new Date('2026-10-10T17:00:00Z'),
  end: new Date('2026-10-10T19:00:00Z'),
  partySize: 4,
  status: 'completed',
  day: '2026-10-10',
  ...over,
})

describe('which bookings are billed', () => {
  it('bills a completed booking', () => {
    expect(countsAsCompleted(booking(), NOW)).toBe(true)
  })

  it('never bills a no-show, a cancellation or a request nobody answered', () => {
    for (const status of ['no-show', 'cancelled', 'pending'] as const) {
      expect(countsAsCompleted(booking({ status }), NOW), status).toBe(false)
    }
  })

  /**
   * A venue that never marks anything must not end up paying nothing. A
   * confirmed booking counts once it ended AUTO_COMPLETE_DAYS ago, and not a
   * moment before, so the venue always has the full week to say otherwise.
   */
  it('counts an unmarked confirmed booking once its seven days have passed', () => {
    const end = new Date('2026-11-01T19:00:00Z')
    const confirmed = booking({ status: 'confirmed', end })
    const justInside = new Date(end.getTime() + AUTO_COMPLETE_DAYS * 86_400_000 - 1)
    const exactly = new Date(end.getTime() + AUTO_COMPLETE_DAYS * 86_400_000)

    expect(countsAsCompleted(confirmed, justInside)).toBe(false)
    expect(countsAsCompleted(confirmed, exactly)).toBe(true)
  })
})

describe('what one booking costs', () => {
  it('charges nothing when no rate is set, so nobody is billed without an agreement', () => {
    expect(hasCommission(null)).toBe(false)
    expect(hasCommission({ rate: 0 })).toBe(false)
    expect(commissionFor({}, booking({ amount: 100 }), NOW)).toBeNull()
  })

  it('takes the rate of what the guest spent', () => {
    expect(commissionFor({ rate: 10 }, booking({ amount: 120 }), NOW)).toEqual({
      base: 120,
      rate: 10,
      amount: 12,
    })
  })

  it('keeps cents exact', () => {
    expect(commissionFor({ rate: 10 }, booking({ amount: 45.5 }), NOW)).toMatchObject({
      amount: 4.55,
    })
  })

  it('says so when the guest came but nobody gave an amount', () => {
    expect(commissionFor({ rate: 10 }, booking(), NOW)).toBe('no-amount')
  })

  it('never bills a guest who did not come, whatever the amount', () => {
    expect(commissionFor({ rate: 10 }, booking({ status: 'no-show', amount: 80 }), NOW)).toBeNull()
  })

  it('bills nothing inside the launch offer, including its last day', () => {
    const settings = { rate: 10, waivedUntil: '2026-10-10' }
    expect(commissionFor(settings, booking({ day: '2026-10-10', amount: 50 }), NOW)).toBeNull()
    expect(commissionFor(settings, booking({ day: '2026-10-11', amount: 50 }), NOW)).not.toBeNull()
  })
})

describe('which amount the commission is taken of', () => {
  it("takes the venue's figure, and the guest's when the venue gave none", () => {
    expect(billableAmount({ amount: 100, guestAmount: 90 })).toBe(100)
    expect(billableAmount({ amount: null, guestAmount: 90 })).toBe(90)
    expect(billableAmount({})).toBeNull()
  })

  it("takes the guest's figure where the team sided with the guest", () => {
    expect(billableAmount({ amount: 40, guestAmount: 120, verdict: 'guest' })).toBe(120)
    expect(billableAmount({ amount: 40, guestAmount: 120, verdict: 'venue' })).toBe(40)
  })
})

describe('which rate applies', () => {
  it("uses the listing's own rate, even zero, and the default otherwise", () => {
    expect(effectiveRate(8, 10)).toBe(8)
    expect(effectiveRate(0, 10)).toBe(0)
    expect(effectiveRate(null, 10)).toBe(10)
    expect(effectiveRate(null, null)).toBeNull()
  })
})

describe('months', () => {
  it('knows where a month starts and ends, across the new year', () => {
    expect(periodBounds('2026-10')).toEqual({ first: '2026-10-01', next: '2026-11-01' })
    expect(periodBounds('2026-12')).toEqual({ first: '2026-12-01', next: '2027-01-01' })
  })

  it('draws a month up on the 8th of the next, once every booking has had its seven days', () => {
    expect(statementReadyOn('2026-10')).toBe('2026-11-08')
    expect(statementReadyOn('2026-12')).toBe('2027-01-08')
  })

  it('finds the month before', () => {
    expect(previousPeriod('2026-11-08')).toBe('2026-10')
    expect(previousPeriod('2027-01-08')).toBe('2026-12')
  })
})

describe('statements', () => {
  it('takes an upheld dispute off the total and nothing else', () => {
    const totals = statementTotals([
      { amount: 4, disputeOutcome: 'none' },
      { amount: 16, disputeOutcome: 'upheld' },
      { amount: 6, disputeOutcome: 'open' },
      { amount: 12, disputeOutcome: 'rejected' },
    ])
    expect(totals).toEqual({ subtotal: 22, vat: 0, total: 22 })
  })

  it('adds VAT when a rate is set', () => {
    expect(statementTotals([{ amount: 100 }], 11)).toEqual({ subtotal: 100, vat: 11, total: 111 })
  })

  it('gives seven days to question and fifteen to pay', () => {
    const sent = new Date('2026-11-08T10:00:00Z')
    const { disputeUntil, dueAt } = statementDeadlines(sent)
    expect(disputeUntil.toISOString()).toBe('2026-11-15T10:00:00.000Z')
    expect(dueAt.toISOString()).toBe('2026-11-23T10:00:00.000Z')
  })

  it('is overdue only once sent and past its due date', () => {
    const dueAt = '2026-11-23T10:00:00.000Z'
    expect(statementState({ status: 'sent', dueAt }, new Date('2026-11-20'))).toBe('open')
    expect(statementState({ status: 'sent', dueAt }, new Date('2026-11-24'))).toBe('overdue')
    expect(statementState({ status: 'paid', dueAt }, new Date('2026-12-30'))).toBe('paid')
    expect(statementState({ status: 'draft' }, new Date('2026-12-30'))).toBe('draft')
  })

  it('lets a line be questioned once, while the statement is sent and the window open', () => {
    const statement = { status: 'sent' as const, disputeUntil: '2026-11-15T10:00:00.000Z' }
    const inside = new Date('2026-11-14')
    expect(canDispute(statement, { disputeOutcome: 'none' }, inside)).toBe(true)
    expect(canDispute(statement, { disputeOutcome: 'open' }, inside)).toBe(false)
    expect(canDispute(statement, { disputeOutcome: 'none' }, new Date('2026-11-16'))).toBe(false)
    expect(canDispute({ ...statement, status: 'paid' }, {}, inside)).toBe(false)
  })

  it('numbers invoices by year', () => {
    expect(statementNumber(2026, 7)).toBe('VRD-2026-0007')
  })
})
