import { describe, expect, it } from 'vitest'
import {
  ADMIN_ONLY_ACTIONS,
  addMonths,
  afterAccept,
  afterBalance,
  afterUndo,
  differsFromExpected,
  downpaymentFor,
  findDuplicateTransfer,
  forfeitReceived,
  formatMoney,
  fromCents,
  isRefusal,
  parseAmount,
  parseDays,
  parseMethod,
  parseNote,
  parseReason,
  parseSender,
  parseWhishAt,
  refusalFor,
  stageAfterNotAccepted,
  stageAfterRefund,
  summarise,
  toCents,
  type PaymentAction,
  type PaymentEntry,
  type PaymentStage,
  type SubmissionStatus,
  type SubmissionView,
} from './place-payment-rules'

const NOW = new Date('2026-11-24T12:00:00.000Z')
const down = (amount = 500, over: Partial<PaymentEntry> = {}): PaymentEntry => ({
  id: 'd1',
  type: 'downpayment',
  amount,
  senderNumber: '03123456',
  whishAt: '2026-11-24T10:30:00.000Z',
  ...over,
})
const bal = (amount: number, over: Partial<PaymentEntry> = {}): PaymentEntry => ({
  id: 'b1',
  type: 'balance',
  amount,
  ...over,
})
const ref = (amount: number, over: Partial<PaymentEntry> = {}): PaymentEntry => ({
  id: 'r1',
  type: 'refund',
  amount,
  ...over,
})
const view = (over: Partial<SubmissionView> = {}): SubmissionView => ({
  status: 'pending',
  stage: 'none',
  published: false,
  entries: [],
  price: 1000,
  ...over,
})

describe('money in cents', () => {
  it('avoids float errors', () => {
    expect(fromCents(toCents(0.1) + toCents(0.2))).toBe(0.3)
    expect(summarise([bal(0.1), bal(0.2, { id: 'b2' })], 1).received).toBe(0.3)
    expect(summarise([bal(0.1), bal(0.2, { id: 'b2' })], 1).stillToPay).toBe(0.7)
  })

  it('works out the downpayment from the percent, to the cent', () => {
    expect(downpaymentFor(1000, 50)).toBe(500)
    expect(downpaymentFor(999.99, 50)).toBe(500)
    expect(downpaymentFor(333, 33.3)).toBe(110.89)
    expect(downpaymentFor(1000, 100)).toBe(1000)
  })

  it('formats dollars and other currencies', () => {
    expect(formatMoney(500)).toBe('$500')
    expect(formatMoney(12.5)).toBe('$12.50')
    expect(formatMoney(10, 'eur')).toBe('10 EUR')
  })

  it('sums received and refunded, ignores voided lines, never owes below zero', () => {
    const entries = [down(500), bal(200), bal(50, { id: 'b2', voided: true }), ref(100)]
    expect(summarise(entries, 1000)).toEqual({ received: 700, refunded: 100, stillToPay: 300 })
    expect(summarise([down(1200)], 1000).stillToPay).toBe(0)
    expect(summarise([], 1000)).toEqual({ received: 0, refunded: 0, stillToPay: 1000 })
  })

  it('flags an amount different from the expected one', () => {
    expect(differsFromExpected(500, 500)).toBe(false)
    expect(differsFromExpected(500.001, 500)).toBe(false)
    expect(differsFromExpected(499.99, 500)).toBe(true)
  })
})

describe('addMonths', () => {
  it('keeps the day, and clamps to the end of a short month', () => {
    expect(addMonths(new Date('2026-11-24T08:00:00Z'), 12).toISOString()).toBe(
      '2027-11-24T08:00:00.000Z',
    )
    expect(addMonths(new Date('2027-01-31T00:00:00Z'), 1).toISOString()).toBe(
      '2027-02-28T00:00:00.000Z',
    )
  })
})

describe('input parsing', () => {
  it('reads amounts', () => {
    expect(parseAmount(500)).toBe(500)
    expect(parseAmount('12.50')).toBe(12.5)
    for (const bad of [0, -1, 'abc', null, undefined, Number.NaN, 12.345, 2_000_000, true]) {
      expect(isRefusal(parseAmount(bad)), String(bad)).toBe(true)
    }
  })

  it('reads notes and reasons', () => {
    expect(parseNote(undefined)).toBe('')
    expect(parseNote('  hi ')).toBe('hi')
    expect(isRefusal(parseNote(5))).toBe(true)
    expect(isRefusal(parseNote('x'.repeat(1001)))).toBe(true)
    expect(isRefusal(parseReason('   '))).toBe(true)
    expect(parseReason(' late ')).toBe('late')
  })

  it('reads the method, Whish by default', () => {
    expect(parseMethod(undefined)).toBe('whish')
    expect(parseMethod('cash')).toBe('cash')
    expect(isRefusal(parseMethod('card'))).toBe(true)
  })

  it('normalises the sender, and requires it when asked', () => {
    expect(parseSender('+961 3 123 456', true)).toBe('03123456')
    expect(parseSender('', false)).toBeNull()
    expect(isRefusal(parseSender('', true))).toBe(true)
    expect(isRefusal(parseSender('+33 6 12 34 56 78', false))).toBe(true)
  })

  it('needs the Whish time with a zone, cuts it to the minute, refuses the future', () => {
    expect(parseWhishAt('2026-11-24T12:30:45+02:00', true, NOW)).toBe('2026-11-24T10:30:00.000Z')
    expect(parseWhishAt(undefined, false, NOW)).toBeNull()
    expect(isRefusal(parseWhishAt(undefined, true, NOW))).toBe(true)
    expect(isRefusal(parseWhishAt('2026-11-24T10:30', true, NOW))).toBe(true)
    expect(isRefusal(parseWhishAt('not a dateZ', true, NOW))).toBe(true)
    expect(isRefusal(parseWhishAt('2026-11-25T10:30:00Z', true, NOW))).toBe(true)
    // Five minutes ahead is clock skew, not the future.
    expect(parseWhishAt('2026-11-24T12:05:00Z', true, NOW)).toBe('2026-11-24T12:05:00.000Z')
  })

  it('reads extension days', () => {
    expect(parseDays(7)).toBe(7)
    expect(parseDays('3')).toBe(3)
    for (const bad of [0, 91, 1.5, 'x', null]) expect(isRefusal(parseDays(bad))).toBe(true)
  })
})

describe('findDuplicateTransfer', () => {
  const others = [
    { id: 1, entries: [down(500, { senderNumber: '+961 3 123 456' })] },
    { id: 2, entries: [down(500, { senderNumber: '03999999', voided: true })] },
    {
      id: 3,
      entries: [ref(500, { senderNumber: '71000000', whishAt: '2026-11-24T10:30:00.000Z' })],
    },
  ]

  it('finds the same sender and minute on one line, whichever way the number was written', () => {
    expect(findDuplicateTransfer(others, '03123456', '2026-11-24T10:30:59.000Z')).toEqual({
      businessId: 1,
    })
  })

  it('ignores voided lines and refunds', () => {
    expect(findDuplicateTransfer(others, '03999999', '2026-11-24T10:30:00.000Z')).toBeNull()
    expect(findDuplicateTransfer(others, '71000000', '2026-11-24T10:30:00.000Z')).toBeNull()
  })

  it('needs both on the same line', () => {
    const split = [
      {
        id: 4,
        entries: [
          down(1, { id: 'a', senderNumber: '76111111', whishAt: '2026-01-01T00:00:00Z' }),
          down(1, { id: 'b', senderNumber: '76222222', whishAt: '2026-02-01T00:00:00Z' }),
        ],
      },
    ]
    expect(findDuplicateTransfer(split, '76111111', '2026-02-01T00:00:00.000Z')).toBeNull()
    expect(findDuplicateTransfer(split, '03123456', '2026-11-24T11:30:00.000Z')).toBeNull()
  })
})

// Every action against every status: exactly the allowed pairs pass.
const STATUSES: SubmissionStatus[] = [
  'incomplete',
  'abandoned',
  'awaiting_downpayment',
  'pending',
  'accepted',
  'paid',
  'lapsed',
  'approved',
  'rejected',
  'expired',
]

const ALLOWED: Record<PaymentAction, SubmissionStatus[]> = {
  recordDownpayment: ['awaiting_downpayment'],
  waiveDownpayment: ['awaiting_downpayment'],
  accept: ['pending'],
  rejectNotAccepted: ['incomplete', 'awaiting_downpayment', 'pending'],
  recordRefundSent: ['rejected'],
  recordBalance: ['accepted'],
  rejectUnpaid: ['accepted'],
  lapseUnpaidDownpayment: ['awaiting_downpayment'],
  undoMoneyEntry: STATUSES.filter((s) => s !== 'approved'),
  extendDeadline: ['awaiting_downpayment', 'lapsed', 'accepted'],
}

describe('refusalFor: the state machine', () => {
  const stageFor = (action: PaymentAction): PaymentStage =>
    action === 'accept' ? 'downpayment_paid' : action === 'recordRefundSent' ? 'refund_due' : 'none'

  for (const action of Object.keys(ALLOWED) as PaymentAction[]) {
    it(`${action}: allowed exactly from ${ALLOWED[action].join(', ')}`, () => {
      for (const status of STATUSES) {
        const r = refusalFor(action, view({ status, stage: stageFor(action) }))
        if (ALLOWED[action].includes(status)) expect(r, status).toBeNull()
        else {
          expect(r, status).not.toBeNull()
          expect(r!.message.length, status).toBeGreaterThan(10)
        }
      }
    })
  }

  it('refuses a form that is not a submission', () => {
    expect(refusalFor('recordDownpayment', view({ status: null }))!.code).toBe('wrong-state')
  })

  it('accept needs the downpayment recorded or waived', () => {
    expect(refusalFor('accept', view({ stage: 'none' }))!.message).toMatch(/downpayment/)
    expect(refusalFor('accept', view({ stage: 'waived' }))).toBeNull()
    expect(refusalFor('accept', view({ status: 'awaiting_downpayment' }))!.message).toMatch(
      /not been received/,
    )
  })

  it('a refund needs a refund to be due', () => {
    expect(
      refusalFor('recordRefundSent', view({ status: 'rejected', stage: 'kept' })),
    ).not.toBeNull()
  })

  it('refuses everything but undo on a published listing, and undo once approved', () => {
    for (const action of Object.keys(ALLOWED) as PaymentAction[]) {
      const r = refusalFor(action, view({ status: 'accepted', published: true }))
      expect(r?.code, action).toBe('published')
    }
    expect(refusalFor('undoMoneyEntry', view({ status: 'approved' }))!.code).toBe('published')
  })

  it('names the admin-only actions', () => {
    expect([...ADMIN_ONLY_ACTIONS].sort()).toEqual(['undoMoneyEntry', 'waiveDownpayment'])
  })
})

describe('what actions lead to', () => {
  it('accept: accepted with the rest due, or fully paid when the downpayment covers it', () => {
    expect(afterAccept([down(500)], 1000, 'downpayment_paid')).toEqual({
      status: 'accepted',
      stage: 'downpayment_paid',
    })
    expect(afterAccept([down(1000)], 1000, 'downpayment_paid')).toEqual({
      status: 'paid',
      stage: 'fully_paid',
    })
    expect(afterAccept([], 1000, 'none')).toEqual({ status: 'accepted', stage: 'waived' })
  })

  it('balance: paid once the total reaches the price, otherwise still accepted', () => {
    expect(afterBalance([down(500), bal(300)], 1000)).toMatchObject({
      status: 'accepted',
      summary: { stillToPay: 200 },
    })
    expect(afterBalance([down(500), bal(500)], 1000)).toMatchObject({ status: 'paid' })
    expect(afterBalance([down(500), bal(600)], 1000)).toMatchObject({ status: 'paid' })
  })

  it('balance: refused without a price, never read as fully paid', () => {
    for (const price of [0, 0.001, -5, Number.NaN]) {
      expect(afterBalance([down(500), bal(500)], price), String(price)).toEqual({
        code: 'no-price',
        message: expect.stringMatching(/no price/),
      })
    }
    expect(afterBalance([bal(0.01)], 0.01)).toMatchObject({ status: 'paid' })
  })

  it('not accepted: refund due only when money came in and was not returned', () => {
    expect(stageAfterNotAccepted([down(500)], 1000)).toBe('refund_due')
    expect(stageAfterNotAccepted([], 1000)).toBe('none')
    expect(stageAfterNotAccepted([down(500, { voided: true })], 1000)).toBe('none')
  })

  it('refund: refunded once everything went back', () => {
    expect(stageAfterRefund([down(500), ref(200)], 1000)).toBe('refund_due')
    expect(stageAfterRefund([down(500), ref(200), ref(300, { id: 'r2' })], 1000)).toBe('refunded')
  })

  it('did not pay: received lines are kept, refunds and voided lines untouched', () => {
    const out = forfeitReceived([down(500), bal(100), bal(5, { id: 'v', voided: true })])
    expect(out.stage).toBe('kept')
    expect(out.entries.map((e) => e.forfeited ?? false)).toEqual([true, true, false])
    expect(forfeitReceived([]).stage).toBe('none')
  })
})

describe('afterUndo', () => {
  it('the only downpayment of a submission in review: back to awaiting the downpayment', () => {
    const r = afterUndo(view({ stage: 'downpayment_paid', entries: [down()] }), 'd1')
    expect(r).toMatchObject({ status: 'awaiting_downpayment', stage: 'none' })
  })

  it('a downpayment after acceptance or rejection: refused with a plain message', () => {
    for (const status of ['accepted', 'paid', 'rejected'] as const) {
      const r = afterUndo(view({ status, stage: 'downpayment_paid', entries: [down()] }), 'd1')
      expect(isRefusal(r), status).toBe(true)
    }
  })

  it('a payment of the rest: steps paid back to accepted', () => {
    const r = afterUndo(
      view({ status: 'paid', stage: 'fully_paid', entries: [down(), bal(500)] }),
      'b1',
    )
    expect(r).toMatchObject({ status: 'accepted', stage: 'downpayment_paid' })
    const waived = afterUndo(
      view({ status: 'paid', stage: 'fully_paid', entries: [bal(1000)] }),
      'b1',
    )
    expect(waived).toMatchObject({ status: 'accepted', stage: 'waived' })
  })

  it('one of two downpayments after acceptance: recounted like a payment of the rest', () => {
    const two = [down(500), down(500, { id: 'd2', whishAt: '2026-11-24T10:45:00.000Z' })]
    // Paid on two downpayments: undoing one leaves $500 to pay, so back to accepted.
    expect(afterUndo(view({ status: 'paid', stage: 'fully_paid', entries: two }), 'd2')).toEqual(
      expect.objectContaining({ status: 'accepted', stage: 'downpayment_paid' }),
    )
    // Still covered by what remains: stays paid.
    const over = [down(1000), down(200, { id: 'd2' })]
    expect(
      afterUndo(view({ status: 'paid', stage: 'fully_paid', entries: over }), 'd2'),
    ).toMatchObject({ status: 'paid', stage: 'fully_paid' })
    // Accepted stays accepted, with the downpayment stage.
    expect(
      afterUndo(view({ status: 'accepted', stage: 'downpayment_paid', entries: two }), 'd2'),
    ).toMatchObject({ status: 'accepted', stage: 'downpayment_paid' })
    // Before acceptance nothing moves (never promoted to accepted).
    expect(
      afterUndo(view({ status: 'pending', stage: 'downpayment_paid', entries: two }), 'd2'),
    ).toMatchObject({ status: 'pending', stage: 'downpayment_paid' })
  })

  it('undoing a money-in line after acceptance is refused without a price', () => {
    const r = afterUndo(
      view({ status: 'paid', stage: 'fully_paid', price: 0, entries: [down(), bal(500)] }),
      'b1',
    )
    expect((r as { code: string }).code).toBe('no-price')
  })

  it('a refund line of a rejected submission: refund due again', () => {
    const r = afterUndo(
      view({ status: 'rejected', stage: 'refunded', entries: [down(), ref(500)] }),
      'r1',
    )
    expect(r).toMatchObject({ status: 'rejected', stage: 'refund_due' })
  })

  it('refuses an unknown or already undone line', () => {
    expect((afterUndo(view({ entries: [down()] }), 'zz') as { code: string }).code).toBe(
      'not-found',
    )
    expect(
      (afterUndo(view({ entries: [down(500, { voided: true })] }), 'd1') as { code: string }).code,
    ).toBe('wrong-state')
  })
})
