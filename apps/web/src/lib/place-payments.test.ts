import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('./place-payment-notify', () => ({ notifyAfterChange: vi.fn(async () => {}) }))
vi.mock('./branches', async () => ({
  runInTransaction: (await import('./place-submission-fake')).runInFakeTransaction,
}))
vi.mock('./partner-lock', async () => ({
  advisoryLock: (await import('./place-submission-fake')).fakeAdvisoryLock,
  placeSubmissionLockKey: (id: number | string) => `lock-${id}`,
}))

import { notifyAfterChange } from './place-payment-notify'
import { reportError } from './report'
import { bindFakeLog, fakePayload, type FakePayload } from './place-submission-fake'
import {
  WHISH_TRANSFER_LOCK_KEY,
  acceptSubmission,
  extendDeadline,
  lapseUnpaidDownpayment,
  recordBalance,
  recordDownpayment,
  recordRefundSent,
  rejectNotAccepted,
  rejectUnpaid,
  undoMoneyEntry,
  waiveDownpayment,
} from './place-payments'

const NOW = new Date('2026-11-24T12:00:00.000Z')
const staff = { id: 2, collection: 'users', roles: ['staff'] }
const admin = { id: 1, collection: 'users', roles: ['admin'] }
const partner = { id: 9, collection: 'business-users', businesses: [7] }
const asStaff = { user: staff }
const asAdmin = { user: admin }

type Row = Record<string, unknown>
let f: FakePayload

const DOWN = {
  id: 'd1',
  type: 'downpayment',
  amount: 500,
  currency: 'USD',
  senderNumber: '03123456',
  whishAt: '2026-11-24T10:30:00.000Z',
  method: 'whish',
  voided: false,
}

function business(status: string, over: Row = {}, payment: Row = {}, payments: Row[] = []) {
  return {
    id: 7,
    name: 'Cafe Cedar',
    _status: 'draft',
    issue: 3,
    listingNumber: 12,
    ...over,
    submission: {
      status,
      reference: 'VD-7',
      ownerName: 'Sami',
      ownerEmail: 'sami@example.com',
      ownerPhone: '03 123 456',
      payments,
      payment: {
        stage: 'none',
        price: 1000,
        downpaymentAmount: 500,
        currency: 'USD',
        received: 0,
        refunded: 0,
        stillToPay: 1000,
        downpaymentDueAt: '2026-12-01T12:00:00.000Z',
        balanceDeadlineDays: 30,
        ...payment,
      },
      ...(over.submission as Row | undefined),
    },
  }
}

const world = (...rows: Row[]) => {
  f = fakePayload({ businesses: rows as never })
  bindFakeLog(f)
  return f
}
const sub = (index = 0) =>
  f.row('businesses', index).submission as Row & {
    payment: Row
    payments: Row[]
    history?: Row[]
  }

const money = (over: Row = {}) => ({
  amount: 500,
  senderNumber: '+961 3 123 456',
  whishAt: '2026-11-24T12:30:00+02:00',
  ...over,
})

beforeEach(() => {
  vi.mocked(notifyAfterChange).mockClear()
  vi.mocked(reportError).mockClear()
})

describe('who may act', () => {
  it.each([
    ['nobody', null],
    ['a partner', partner],
    ['a guest with a roles field', { id: 3, collection: 'customers', roles: ['admin'] }],
  ])('refuses %s with 403 before reading anything', async (_l, user) => {
    world(business('awaiting_downpayment'))
    const r = await recordDownpayment({
      payload: f.payload,
      actor: { user },
      businessId: 7,
      now: NOW,
      ...money(),
    })
    expect(r).toMatchObject({ ok: false, status: 403, code: 'not-staff' })
    expect(f.updates).toHaveLength(0)
    expect(f.log).toHaveLength(0)
  })

  it.each([
    [
      'waive',
      () => waiveDownpayment({ payload: f.payload, actor: asStaff, businessId: 7, reason: 'x' }),
    ],
    [
      'undo',
      () =>
        undoMoneyEntry({
          payload: f.payload,
          actor: asStaff,
          businessId: 7,
          entryId: 'd1',
          reason: 'x',
        }),
    ],
  ])('%s is for an admin only', async (_l, act) => {
    world(business('awaiting_downpayment'))
    expect(await act()).toMatchObject({ ok: false, status: 403, code: 'not-admin' })
    expect(f.updates).toHaveLength(0)
  })

  it('a job may only lapse and reject unpaid, never record money', async () => {
    world(business('awaiting_downpayment'))
    const r = await recordDownpayment({
      payload: f.payload,
      actor: { system: 'job' },
      businessId: 7,
      ...money(),
    })
    expect(r).toMatchObject({ ok: false, status: 403 })
  })

  it.each([
    ['staff', asStaff],
    ['an admin', asAdmin],
  ])('%s may record the downpayment and the balance', async (_l, actor) => {
    world(business('awaiting_downpayment'))
    const down = await recordDownpayment({
      payload: f.payload,
      actor,
      businessId: 7,
      now: NOW,
      ...money(),
    })
    expect(down).toMatchObject({ ok: true, status: 'pending', stage: 'downpayment_paid' })
    world(
      business('accepted', {}, { stage: 'downpayment_paid', received: 500, stillToPay: 500 }, [
        DOWN,
      ]),
    )
    const rest = await recordBalance({
      payload: f.payload,
      actor,
      businessId: 7,
      now: NOW,
      ...money({ whishAt: '2026-11-24T13:45:00+02:00' }),
    })
    expect(rest).toMatchObject({ ok: true, status: 'paid', stage: 'fully_paid' })
  })

  it('refuses a bad id and a missing business', async () => {
    world(business('awaiting_downpayment'))
    expect(
      await acceptSubmission({ payload: f.payload, actor: asStaff, businessId: 'x' }),
    ).toMatchObject({ status: 400 })
    expect(
      await acceptSubmission({ payload: f.payload, actor: asStaff, businessId: 99 }),
    ).toMatchObject({ status: 404, code: 'not-found' })
  })
})

describe('downpayment received', () => {
  it('records the line, moves to review, recounts, writes the history, then asks for E2', async () => {
    world(business('awaiting_downpayment'))
    const r = await recordDownpayment({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      ...money({ note: ' ' }),
    })
    expect(r).toEqual({
      ok: true,
      status: 'pending',
      stage: 'downpayment_paid',
      received: 500,
      stillToPay: 500,
    })
    const s = sub()
    expect(s.status).toBe('pending')
    expect(s.payment).toMatchObject({
      stage: 'downpayment_paid',
      received: 500,
      refunded: 0,
      stillToPay: 500,
    })
    expect(s.payments).toHaveLength(1)
    expect(s.payments[0]).toMatchObject({
      type: 'downpayment',
      amount: 500,
      currency: 'USD',
      senderNumber: '03123456',
      whishAt: '2026-11-24T10:30:00.000Z',
      method: 'whish',
      note: null,
      recordedBy: 2,
      recordedAt: NOW.toISOString(),
      voided: false,
    })
    expect(String(s.payments[0]!.id)).toMatch(/^[0-9a-f]{24}$/)
    expect(s.history).toMatchObject([
      { step: 'downpayment_received', by: 2, note: '$500 by Whish' },
      { step: 'pending', by: 2 },
    ])
    // No owner details in the history: the sender is on the money line only.
    expect(JSON.stringify(s.history)).not.toContain('03123456')
    // The number stays reserved.
    expect(f.row('businesses').listingNumber).toBe(12)
    expect(notifyAfterChange).toHaveBeenCalledWith('E2', expect.objectContaining({ businessId: 7 }))
  })

  it('is refused in any other state, with a plain message and nothing written', async () => {
    for (const status of ['pending', 'accepted', 'rejected', 'lapsed', 'incomplete']) {
      world(business(status))
      const r = await recordDownpayment({
        payload: f.payload,
        actor: asStaff,
        businessId: 7,
        now: NOW,
        ...money(),
      })
      expect(r, status).toMatchObject({ ok: false, status: 409, code: 'wrong-state' })
      expect(f.updates).toHaveLength(0)
    }
    expect(notifyAfterChange).not.toHaveBeenCalled()
  })

  it('needs a note when the amount is not the expected downpayment', async () => {
    world(business('awaiting_downpayment'))
    const r = await recordDownpayment({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      ...money({ amount: 450 }),
    })
    expect(r).toMatchObject({ ok: false, status: 400, code: 'bad-input' })
    expect((r as { message: string }).message).toContain('$500')
    const ok = await recordDownpayment({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      ...money({ amount: 450, note: 'sent 450, rest later' }),
    })
    expect(ok).toMatchObject({ ok: true, received: 450, stillToPay: 550 })
  })

  it('without a copied downpayment (older rows), expects the settings percent of the price', async () => {
    world(business('awaiting_downpayment', {}, { downpaymentAmount: null }))
    f.settings.value = { magazinePlaces: { downpaymentPercent: 40 } }
    const r = await recordDownpayment({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      ...money(),
    })
    expect((r as { message: string }).message).toContain('$400')
  })

  it('validates the input before reading anything', async () => {
    world(business('awaiting_downpayment'))
    for (const bad of [
      money({ amount: 0 }),
      money({ senderNumber: '' }),
      money({ whishAt: '2026-11-24T10:30' }),
      money({ method: 'card' }),
      money({ note: 5 }),
    ]) {
      const r = await recordDownpayment({
        payload: f.payload,
        actor: asStaff,
        businessId: 7,
        now: NOW,
        ...bad,
      })
      expect(r, JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 })
    }
    expect(f.log).toHaveLength(0)
  })

  it('takes cash at the desk without a sender or a time', async () => {
    world(business('awaiting_downpayment'))
    const r = await recordDownpayment({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      amount: 500,
      method: 'desk',
    })
    expect(r.ok).toBe(true)
    expect(sub().payments[0]).toMatchObject({ method: 'desk', senderNumber: null, whishAt: null })
  })

  describe('one Whish transfer is recorded once, across all businesses', () => {
    const other = (payments: Row[]) => ({
      ...business('pending', {}, { stage: 'downpayment_paid' }, payments),
      id: 8,
      listingNumber: 13,
    })

    it('refuses the same sender and minute written another way on another business', async () => {
      world(
        business('awaiting_downpayment'),
        other([{ ...DOWN, whishAt: '2026-11-24T10:30:00.000Z' }]),
      )
      const r = await recordDownpayment({
        payload: f.payload,
        actor: asStaff,
        businessId: 7,
        now: NOW,
        ...money({ whishAt: '2026-11-24T12:30:40+02:00' }),
      })
      expect(r).toMatchObject({ ok: false, status: 409, code: 'duplicate-payment' })
      expect((r as { message: string }).message).toContain('listing 8')
      expect(f.updates).toHaveLength(0)
      // Lock order: the submission first, then the transfers.
      expect(f.log.indexOf('lock:lock-7')).toBeLessThan(
        f.log.indexOf(`lock:${WHISH_TRANSFER_LOCK_KEY}`),
      )
    })

    it('allows it when that line was undone, or the minute differs', async () => {
      world(business('awaiting_downpayment'), other([{ ...DOWN, voided: true }]))
      expect(
        (
          await recordDownpayment({
            payload: f.payload,
            actor: asStaff,
            businessId: 7,
            now: NOW,
            ...money(),
          })
        ).ok,
      ).toBe(true)
      world(
        business('awaiting_downpayment'),
        other([{ ...DOWN, whishAt: '2026-11-24T10:31:00.000Z' }]),
      )
      expect(
        (
          await recordDownpayment({
            payload: f.payload,
            actor: asStaff,
            businessId: 7,
            now: NOW,
            ...money(),
          })
        ).ok,
      ).toBe(true)
    })

    it('does not mix two lines of one business (sender of one, time of the other)', async () => {
      world(
        business('awaiting_downpayment'),
        other([
          { ...DOWN, id: 'a', whishAt: '2026-01-01T00:00:00.000Z' },
          { ...DOWN, id: 'b', senderNumber: '71000000', whishAt: '2026-11-24T10:30:00.000Z' },
        ]),
      )
      expect(
        (
          await recordDownpayment({
            payload: f.payload,
            actor: asStaff,
            businessId: 7,
            now: NOW,
            ...money(),
          })
        ).ok,
      ).toBe(true)
    })
  })
})

const reviewed = (payment: Row = {}, payments: Row[] = [DOWN]) =>
  business(
    'pending',
    {},
    { stage: 'downpayment_paid', received: 500, stillToPay: 500, ...payment },
    payments,
  )

describe('accept', () => {
  it('accepts with the rest due in the copied number of days, then asks for E3', async () => {
    world(reviewed())
    const r = await acceptSubmission({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
    })
    expect(r).toMatchObject({
      ok: true,
      status: 'accepted',
      stage: 'downpayment_paid',
      stillToPay: 500,
    })
    expect(sub()).toMatchObject({ status: 'accepted', acceptedAt: NOW.toISOString() })
    expect(sub().payment.balanceDueAt).toBe('2026-12-24T12:00:00.000Z')
    expect(sub().history).toMatchObject([{ step: 'accepted', by: 2 }])
    expect(String(sub().history![0]!.note)).toContain('$500 still to pay by 24 Dec 2026')
    expect(notifyAfterChange).toHaveBeenCalledWith('E3', expect.anything())
  })

  it('is refused before the downpayment, with a plain message', async () => {
    world(business('awaiting_downpayment'))
    const r = await acceptSubmission({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
    })
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect((r as { message: string }).message).toMatch(/downpayment has not been received/)
  })

  it('a downpayment that covered the whole price is fully paid at once: E3paid, not E3', async () => {
    world(reviewed({ received: 1000, stillToPay: 0 }, [{ ...DOWN, amount: 1000 }]))
    const r = await acceptSubmission({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
    })
    expect(r).toMatchObject({ status: 'paid', stage: 'fully_paid' })
    expect(sub().payment.balanceDueAt).toBeNull()
    expect(notifyAfterChange).toHaveBeenCalledTimes(1)
    expect(notifyAfterChange).toHaveBeenCalledWith('E3paid', expect.anything())
  })
})

describe('reject: not accepted', () => {
  it('with a downpayment: refund due, number released, kind recorded, E5, no plain email', async () => {
    world(reviewed())
    const plainEmail = vi.fn(async () => {})
    const r = await rejectNotAccepted({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      reason: 'Not our kind of place',
      plainEmail,
    })
    expect(r).toMatchObject({
      ok: true,
      status: 'rejected',
      stage: 'refund_due',
      answer: { refundDue: true },
    })
    expect(sub()).toMatchObject({
      status: 'rejected',
      rejectionKind: 'not_accepted',
      rejectionReason: 'Not our kind of place',
      rejectionReasonShared: false,
      rejectedBy: 2,
      rejectedAt: NOW.toISOString(),
    })
    expect(f.row('businesses').listingNumber).toBeNull()
    expect(notifyAfterChange).toHaveBeenCalledWith('E5', expect.anything())
    expect(plainEmail).not.toHaveBeenCalled()
  })

  it('without money (also while the downpayment is awaited): stage none and the plain email', async () => {
    world(business('awaiting_downpayment'))
    const plainEmail = vi.fn(async () => {})
    const r = await rejectNotAccepted({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      reason: 'No',
      plainEmail,
    })
    expect(r).toMatchObject({ ok: true, stage: 'none', answer: { refundDue: false } })
    expect(plainEmail).toHaveBeenCalledTimes(1)
    expect(notifyAfterChange).not.toHaveBeenCalled()
  })

  it('needs a reason, and refuses accepted or published submissions', async () => {
    world(reviewed())
    expect(
      await rejectNotAccepted({ payload: f.payload, actor: asStaff, businessId: 7, reason: ' ' }),
    ).toMatchObject({ status: 400 })
    world(business('accepted'))
    expect(
      await rejectNotAccepted({ payload: f.payload, actor: asStaff, businessId: 7, reason: 'x' }),
    ).toMatchObject({ status: 409 })
    world(business('pending', { _status: 'published' }))
    expect(
      await rejectNotAccepted({ payload: f.payload, actor: asStaff, businessId: 7, reason: 'x' }),
    ).toMatchObject({ status: 409, code: 'published' })
  })

  it('does not undo the rejection when the plain email fails', async () => {
    world(business('pending', {}, { stage: 'waived' }))
    const r = await rejectNotAccepted({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      reason: 'No',
      plainEmail: async () => {
        throw new Error('smtp down')
      },
    })
    expect(r.ok).toBe(true)
    expect(sub().status).toBe('rejected')
    expect(reportError).toHaveBeenCalled()
  })
})

const refundDue = (payments: Row[] = [DOWN]) =>
  business('rejected', { listingNumber: null }, { stage: 'refund_due', received: 500 }, payments)

describe('refund sent', () => {
  it('defaults to what is owed, to the number it came from: refunded', async () => {
    world(refundDue())
    const r = await recordRefundSent({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      whishAt: '2026-11-24T13:00:00+02:00',
    })
    expect(r).toMatchObject({ ok: true, status: 'rejected', stage: 'refunded', received: 500 })
    expect(sub().payments[1]).toMatchObject({
      type: 'refund',
      amount: 500,
      senderNumber: '03123456',
    })
    expect(sub().payment.refunded).toBe(500)
    expect(sub().history).toMatchObject([{ step: 'refund_sent', note: '$500 by Whish' }])
    expect(JSON.stringify(sub().history)).not.toContain('03123456')
  })

  it('a part stays refund due; more than owed is refused', async () => {
    world(refundDue())
    expect(
      await recordRefundSent({
        payload: f.payload,
        actor: asStaff,
        businessId: 7,
        now: NOW,
        amount: 200,
        method: 'cash',
      }),
    ).toMatchObject({ stage: 'refund_due' })
    expect(
      await recordRefundSent({
        payload: f.payload,
        actor: asStaff,
        businessId: 7,
        now: NOW,
        amount: 400,
        method: 'cash',
      }),
    ).toMatchObject({ status: 400 })
  })

  it('is refused when no refund is due', async () => {
    world(business('rejected', {}, { stage: 'none' }))
    expect(
      await recordRefundSent({
        payload: f.payload,
        actor: asStaff,
        businessId: 7,
        now: NOW,
        method: 'cash',
      }),
    ).toMatchObject({ status: 409 })
  })
})

const accepted = (payments: Row[] = [DOWN], payment: Row = {}) =>
  business(
    'accepted',
    {},
    {
      stage: 'downpayment_paid',
      received: 500,
      stillToPay: 500,
      balanceDueAt: '2026-12-24T12:00:00.000Z',
      ...payment,
    },
    payments,
  )

describe('payment of the rest', () => {
  const rest = (over: Row = {}) => money({ whishAt: '2026-11-24T13:45:00+02:00', ...over })

  it('the full rest: fully paid, history says so', async () => {
    world(accepted())
    const r = await recordBalance({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      ...rest(),
    })
    expect(r).toEqual({
      ok: true,
      status: 'paid',
      stage: 'fully_paid',
      received: 1000,
      stillToPay: 0,
    })
    expect(sub().history).toMatchObject([{ step: 'balance_received' }, { step: 'paid' }])
  })

  it('a part needs a note and stays accepted with what is still to pay', async () => {
    world(accepted())
    expect(
      await recordBalance({
        payload: f.payload,
        actor: asStaff,
        businessId: 7,
        now: NOW,
        ...rest({ amount: 200 }),
      }),
    ).toMatchObject({ status: 400 })
    const r = await recordBalance({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      ...rest({ amount: 200, note: 'first half' }),
    })
    expect(r).toMatchObject({
      ok: true,
      status: 'accepted',
      stage: 'downpayment_paid',
      stillToPay: 300,
    })
  })

  it('cents add up exactly', async () => {
    world(accepted([{ ...DOWN, amount: 499.9 }], { received: 499.9 }))
    const r = await recordBalance({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      ...rest({ amount: 500.1 }),
    })
    expect(r).toMatchObject({ status: 'paid', received: 1000, stillToPay: 0 })
  })

  it('refuses the transfer that already paid the downpayment', async () => {
    world(accepted())
    const r = await recordBalance({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      ...money(),
    })
    expect(r).toMatchObject({ ok: false, code: 'duplicate-payment' })
    expect((r as { message: string }).message).toContain('this submission')
  })

  it('is refused without a price on file, never read as fully paid', async () => {
    for (const payment of [{ price: 0 }, { price: null }]) {
      world(accepted([DOWN], payment))
      const r = await recordBalance({
        payload: f.payload,
        actor: asStaff,
        businessId: 7,
        now: NOW,
        ...rest(),
      })
      expect(r, JSON.stringify(payment)).toMatchObject({ ok: false, status: 409, code: 'no-price' })
      expect((r as { message: string }).message).toMatch(/no price/)
      expect(sub().status).toBe('accepted')
      expect(sub().payments).toHaveLength(1)
      expect(f.updates).toHaveLength(0)
    }
  })

  it('is refused before acceptance', async () => {
    world(reviewed())
    expect(
      await recordBalance({
        payload: f.payload,
        actor: asStaff,
        businessId: 7,
        now: NOW,
        ...rest(),
      }),
    ).toMatchObject({ status: 409 })
  })
})

describe('rejected: did not pay the rest', () => {
  it('by staff: kept, lines marked forfeited, number released, E6', async () => {
    world(accepted())
    const r = await rejectUnpaid({ payload: f.payload, actor: asStaff, businessId: 7, now: NOW })
    expect(r).toMatchObject({ ok: true, status: 'rejected', stage: 'kept' })
    expect(sub()).toMatchObject({ rejectionKind: 'unpaid', rejectedBy: 2 })
    expect(String(sub().rejectionReason)).toMatch(/not paid/)
    expect(sub().payments[0]).toMatchObject({ forfeited: true })
    expect(f.row('businesses').listingNumber).toBeNull()
    expect(notifyAfterChange).toHaveBeenCalledWith('E6', expect.anything())
  })

  it('by the job: only once the deadline passed', async () => {
    world(accepted())
    expect(
      await rejectUnpaid({ payload: f.payload, actor: { system: 'job' }, businessId: 7, now: NOW }),
    ).toMatchObject({ status: 409 })
    const later = new Date('2026-12-24T12:00:00.000Z')
    const r = await rejectUnpaid({
      payload: f.payload,
      actor: { system: 'job' },
      businessId: 7,
      now: later,
    })
    expect(r).toMatchObject({ ok: true, stage: 'kept' })
    expect(sub().history).toMatchObject([{ step: 'rejected', by: null }])
  })
})

describe('lapse (job)', () => {
  it('only after the downpayment deadline; remembers the number it gives back; E7', async () => {
    world(business('awaiting_downpayment'))
    expect(
      await lapseUnpaidDownpayment({ payload: f.payload, businessId: 7, now: NOW }),
    ).toMatchObject({ status: 409 })
    const r = await lapseUnpaidDownpayment({
      payload: f.payload,
      businessId: 7,
      now: new Date('2026-12-01T12:00:00.000Z'),
    })
    expect(r).toMatchObject({ ok: true, status: 'lapsed' })
    expect(f.row('businesses').listingNumber).toBeNull()
    expect(sub().payment.lapsedListingNumber).toBe(12)
    expect(notifyAfterChange).toHaveBeenCalledWith('E7', expect.anything())
  })

  it('running twice changes nothing the second time', async () => {
    world(business('awaiting_downpayment'))
    const later = new Date('2026-12-02T00:00:00.000Z')
    await lapseUnpaidDownpayment({ payload: f.payload, businessId: 7, now: later })
    expect(
      await lapseUnpaidDownpayment({ payload: f.payload, businessId: 7, now: later }),
    ).toMatchObject({ ok: false })
    expect(notifyAfterChange).toHaveBeenCalledTimes(1)
  })
})

describe('waive the downpayment (admin)', () => {
  it('waive: to review with stage waived, then staff can accept', async () => {
    world(business('awaiting_downpayment'))
    const r = await waiveDownpayment({
      payload: f.payload,
      actor: asAdmin,
      businessId: 7,
      now: NOW,
      reason: 'Long-time partner',
    })
    expect(r).toMatchObject({ ok: true, status: 'pending', stage: 'waived' })
    expect(sub().history).toMatchObject([
      { step: 'downpayment_waived', note: 'Long-time partner', by: 1 },
      { step: 'pending' },
    ])
    expect(
      (await acceptSubmission({ payload: f.payload, actor: asStaff, businessId: 7, now: NOW })).ok,
    ).toBe(true)
  })
})

describe('undo a money line (admin)', () => {
  it('the only downpayment in review: voided with who and why, back to awaiting it', async () => {
    world(reviewed())
    const r = await undoMoneyEntry({
      payload: f.payload,
      actor: asAdmin,
      businessId: 7,
      now: NOW,
      entryId: 'd1',
      reason: 'Wrong business',
    })
    expect(r).toMatchObject({
      ok: true,
      status: 'awaiting_downpayment',
      stage: 'none',
      received: 0,
    })
    expect(sub().payments[0]).toMatchObject({
      voided: true,
      voidedBy: 1,
      voidedAt: NOW.toISOString(),
      voidReason: 'Wrong business',
    })
    expect(sub().history).toMatchObject([
      { step: 'payment_undone', note: 'Downpayment of $500 undone: Wrong business' },
      { step: 'awaiting_downpayment' },
    ])
  })

  it('is refused after acceptance on the downpayment, and once published', async () => {
    world(accepted())
    expect(
      await undoMoneyEntry({
        payload: f.payload,
        actor: asAdmin,
        businessId: 7,
        entryId: 'd1',
        reason: 'x',
      }),
    ).toMatchObject({ status: 409 })
    world(business('approved', { _status: 'published' }, {}, [DOWN]))
    expect(
      await undoMoneyEntry({
        payload: f.payload,
        actor: asAdmin,
        businessId: 7,
        entryId: 'd1',
        reason: 'x',
      }),
    ).toMatchObject({ code: 'published' })
  })

  describe('a deadline that already passed is renewed when the status steps back', () => {
    const undo = (entryId: string) =>
      undoMoneyEntry({
        payload: f.payload,
        actor: asAdmin,
        businessId: 7,
        now: NOW,
        entryId,
        reason: 'Typo',
      })
    const SENT = '2026-11-20T00:00:00.000Z'
    const FRESH_DOWN = '2026-12-01T12:00:00.000Z' // NOW + 7 days (settings)
    const FRESH_REST = '2026-12-24T12:00:00.000Z' // NOW + 30 days (snapshot)

    it('downpayment deadline in the past: fresh one from today, reminder may go again', async () => {
      world(
        reviewed({ downpaymentDueAt: '2026-11-20T12:00:00.000Z', downpaymentReminderSentAt: SENT }),
      )
      expect(await undo('d1')).toMatchObject({ ok: true, status: 'awaiting_downpayment' })
      expect(sub().payment).toMatchObject({
        downpaymentDueAt: FRESH_DOWN,
        downpaymentReminderSentAt: null,
      })
      expect(sub().history).toMatchObject([
        { step: 'payment_undone' },
        { step: 'deadline_extended', note: expect.stringMatching(/had passed/), by: 1 },
        { step: 'awaiting_downpayment' },
      ])
      // The lapse job no longer finds it overdue.
      expect(
        await lapseUnpaidDownpayment({ payload: f.payload, businessId: 7, now: NOW }),
      ).toMatchObject({ ok: false, code: 'wrong-state' })
    })

    it('downpayment deadline exactly now counts as passed', async () => {
      world(reviewed({ downpaymentDueAt: NOW.toISOString(), downpaymentReminderSentAt: SENT }))
      await undo('d1')
      expect(sub().payment).toMatchObject({
        downpaymentDueAt: FRESH_DOWN,
        downpaymentReminderSentAt: null,
      })
    })

    it('downpayment deadline 1 ms ahead is kept, reminder marker untouched', async () => {
      const ahead = new Date(NOW.getTime() + 1).toISOString()
      world(reviewed({ downpaymentDueAt: ahead, downpaymentReminderSentAt: SENT }))
      await undo('d1')
      expect(sub().payment).toMatchObject({
        downpaymentDueAt: ahead,
        downpaymentReminderSentAt: SENT,
      })
      expect(sub().history).toMatchObject([
        { step: 'payment_undone' },
        { step: 'awaiting_downpayment' },
      ])
    })

    it('no downpayment deadline at all: one is set', async () => {
      world(reviewed({ downpaymentDueAt: null }))
      await undo('d1')
      expect(sub().payment.downpaymentDueAt).toBe(FRESH_DOWN)
    })

    it('paid -> accepted with the rest overdue: fresh deadline from the copied days', async () => {
      world(
        business(
          'paid',
          {},
          {
            stage: 'fully_paid',
            received: 1000,
            stillToPay: 0,
            balanceDueAt: '2026-11-10T12:00:00.000Z',
            balanceReminderSentAt: SENT,
          },
          [DOWN, { id: 'b1', type: 'balance', amount: 500, method: 'desk', voided: false }],
        ),
      )
      expect(await undo('b1')).toMatchObject({ ok: true, status: 'accepted', stillToPay: 500 })
      expect(sub().payment).toMatchObject({
        balanceDueAt: FRESH_REST,
        balanceReminderSentAt: null,
      })
      expect(sub().history).toMatchObject([
        { step: 'payment_undone' },
        { step: 'deadline_extended', note: expect.stringMatching(/rest had passed/) },
        { step: 'accepted' },
      ])
      // The did-not-pay job no longer finds it overdue.
      expect(
        await rejectUnpaid({
          payload: f.payload,
          actor: { system: 'job' },
          businessId: 7,
          now: NOW,
        }),
      ).toMatchObject({ ok: false, code: 'wrong-state' })
    })

    it('paid -> accepted with the rest still running: deadline kept', async () => {
      world(
        business(
          'paid',
          {},
          {
            stage: 'fully_paid',
            balanceDueAt: '2026-12-10T12:00:00.000Z',
            balanceReminderSentAt: SENT,
          },
          [DOWN, { id: 'b1', type: 'balance', amount: 500, method: 'desk', voided: false }],
        ),
      )
      await undo('b1')
      expect(sub().payment).toMatchObject({
        balanceDueAt: '2026-12-10T12:00:00.000Z',
        balanceReminderSentAt: SENT,
      })
    })

    it('paid at acceptance on two downpayments (no deadline for the rest): one is set', async () => {
      world(
        business('paid', {}, { stage: 'fully_paid', balanceDueAt: null }, [
          DOWN,
          { ...DOWN, id: 'd2', whishAt: '2026-11-24T10:45:00.000Z' },
        ]),
      )
      expect(await undo('d2')).toMatchObject({
        ok: true,
        status: 'accepted',
        stage: 'downpayment_paid',
        stillToPay: 500,
      })
      expect(sub().payment.balanceDueAt).toBe(FRESH_REST)
    })

    it('an undo that does not step back leaves the deadlines alone', async () => {
      world(
        accepted([DOWN, { id: 'b1', type: 'balance', amount: 200, voided: false }], {
          balanceDueAt: '2026-11-10T12:00:00.000Z',
        }),
      )
      await undo('b1')
      expect(sub().payment.balanceDueAt).toBe('2026-11-10T12:00:00.000Z')
    })
  })

  it('needs a line id and a reason', async () => {
    world(reviewed())
    expect(
      await undoMoneyEntry({ payload: f.payload, actor: asAdmin, businessId: 7, reason: 'x' }),
    ).toMatchObject({ status: 400 })
    expect(
      await undoMoneyEntry({ payload: f.payload, actor: asAdmin, businessId: 7, entryId: 'd1' }),
    ).toMatchObject({ status: 400 })
  })
})

describe('the engine writes only what it changes', () => {
  it('sends the changed keys alone, so an admin edit after the read is not written back', async () => {
    world(business('awaiting_downpayment', {}, { submittedEmailSentAt: 'x' }))
    const findByID = f.payload.findByID.bind(f.payload)
    f.payload.findByID = (async (args: never) => {
      const read = await findByID(args)
      // Staff save the owner's phone and the terms right after the engine read
      // (an admin save takes no lock).
      const row = f.row('businesses') as unknown as { submission: Row & { terms?: Row } }
      row.submission.ownerPhone = '71000000'
      row.submission.terms = { priceAtAcceptance: 1000, termsVersion: 'edited' }
      return read
    }) as never
    const r = await recordDownpayment({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      ...money(),
    })
    expect(r).toMatchObject({ ok: true, status: 'pending' })
    const data = f.updates.at(-1)!.data as { submission: Row & { payment: Row } }
    expect(Object.keys(data.submission).sort()).toEqual(['payment', 'payments', 'status'])
    expect(Object.keys(data.submission.payment).sort()).toEqual([
      'received',
      'refunded',
      'stage',
      'stillToPay',
    ])
    expect(sub().ownerPhone).toBe('71000000')
    expect((sub().terms as Row).termsVersion).toBe('edited')
    // Nothing else of the summary was lost on the way.
    expect(sub().payment).toMatchObject({
      stage: 'downpayment_paid',
      received: 500,
      downpaymentAmount: 500,
      submittedEmailSentAt: 'x',
    })
  })

  it('leaves the money lines out when the action does not touch them', async () => {
    world(business('awaiting_downpayment'))
    await extendDeadline({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      which: 'downpayment',
      days: 3,
      reason: 'Travelling',
    })
    const data = f.updates.at(-1)!.data as { submission: Row }
    expect(data.submission).not.toHaveProperty('payments')
    expect(data.submission).not.toHaveProperty('ownerName')
  })
})

describe('extend a deadline', () => {
  it('the downpayment: days added to the deadline, a reminder already sent is not sent again', async () => {
    world(
      business(
        'awaiting_downpayment',
        {},
        { downpaymentReminderSentAt: '2026-11-29T00:00:00.000Z' },
      ),
    )
    const r = await extendDeadline({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      which: 'downpayment',
      days: 3,
      reason: 'Travelling',
    })
    expect(r.ok).toBe(true)
    expect(sub().payment).toMatchObject({
      downpaymentDueAt: '2026-12-04T12:00:00.000Z',
      // E1c went once already: its marker stays, so the job never sends it again.
      downpaymentReminderSentAt: '2026-11-29T00:00:00.000Z',
    })
    expect(sub().history).toMatchObject([{ step: 'deadline_extended', by: 2 }])
    // A plain extension sends no new E1 and keeps its marker.
    expect(notifyAfterChange).not.toHaveBeenCalled()
    expect(sub().payment.submittedEmailSentAt).toBeUndefined()
  })

  it('the rest, counted from today when it already passed; the E4 marker is kept', async () => {
    world(
      accepted([DOWN], {
        balanceDueAt: '2026-11-20T00:00:00.000Z',
        balanceReminderSentAt: '2026-11-17T00:00:00.000Z',
      }),
    )
    await extendDeadline({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      which: 'balance',
      days: 5,
      reason: 'Bank delay',
    })
    expect(sub().payment.balanceDueAt).toBe('2026-11-29T12:00:00.000Z')
    expect(sub().payment.balanceReminderSentAt).toBe('2026-11-17T00:00:00.000Z')
  })

  it('an extension before any reminder leaves the markers empty, so the reminder still goes once', async () => {
    world(business('awaiting_downpayment', {}, {}))
    await extendDeadline({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      which: 'downpayment',
      days: 3,
      reason: 'Travelling',
    })
    expect(sub().payment.downpaymentReminderSentAt ?? null).toBeNull()
  })

  it('re-opens a lapsed submission with its old number while it is free', async () => {
    world(
      business(
        'lapsed',
        { listingNumber: null },
        {
          lapsedListingNumber: 12,
          lapsedEmailSentAt: 'x',
          submittedEmailSentAt: '2026-11-10T12:00:00.000Z',
        },
      ),
    )
    const r = await extendDeadline({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      which: 'downpayment',
      days: 2,
      reason: 'Paid late',
    })
    expect(r).toMatchObject({ ok: true, status: 'awaiting_downpayment' })
    expect(f.row('businesses').listingNumber).toBe(12)
    expect(sub().payment).toMatchObject({
      downpaymentDueAt: '2026-11-26T12:00:00.000Z',
      lapsedListingNumber: null,
      lapsedEmailSentAt: null,
      // E1 may go again (and is asked for); E1c is marked done so the job
      // does not send it right after E1.
      submittedEmailSentAt: null,
      downpaymentReminderSentAt: NOW.toISOString(),
    })
    expect(notifyAfterChange).toHaveBeenCalledTimes(1)
    expect(notifyAfterChange).toHaveBeenCalledWith('E1', expect.objectContaining({ businessId: 7 }))
  })

  it('refuses the re-open when another business took the number', async () => {
    world(business('lapsed', { listingNumber: null }, { lapsedListingNumber: 12 }), {
      ...business('pending'),
      id: 8,
      listingNumber: 12,
    })
    const r = await extendDeadline({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      which: 'downpayment',
      days: 2,
      reason: 'x',
    })
    expect(r).toMatchObject({ ok: false, code: 'number-taken' })
    expect(sub().status).toBe('lapsed')
    expect(notifyAfterChange).not.toHaveBeenCalled()
  })

  describe('the number taken between the check and the write', () => {
    const lapsed = () =>
      world(business('lapsed', { listingNumber: null }, { lapsedListingNumber: 12 }))
    const reopen = () =>
      extendDeadline({
        payload: f.payload,
        actor: asStaff,
        businessId: 7,
        now: NOW,
        which: 'downpayment',
        days: 2,
        reason: 'Paid late',
      })

    it('the unique index refusing it (thrown): number-taken, not reported as an error', async () => {
      lapsed()
      f.payload.update = (async () => {
        throw Object.assign(new Error('The following field is invalid: issue_id, listing_number'), {
          name: 'ValidationError',
          data: { errors: [{ path: 'issue_id, listing_number', tableName: 'businesses' }] },
        })
      }) as never
      const r = await reopen()
      expect(r).toMatchObject({ ok: false, status: 409, code: 'number-taken' })
      expect((r as { message: string }).message).toMatch(/new form/)
      expect(reportError).not.toHaveBeenCalled()
    })

    it('the raw driver error (23505 on the index): number-taken', async () => {
      lapsed()
      f.payload.update = (async () => {
        throw Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint: 'issue_listingNumber_idx',
        })
      }) as never
      expect(await reopen()).toMatchObject({ code: 'number-taken' })
    })

    it('collected by the update (only messages survive): number-taken', async () => {
      lapsed()
      for (const message of [
        'The following field is invalid: issue_id, listing_number',
        'The following field is invalid: Listing number',
      ]) {
        f.payload.update = (async () => ({ docs: [], errors: [{ id: 7, message }] })) as never
        expect(await reopen(), message).toMatchObject({ code: 'number-taken' })
      }
    })

    it('any other failure of the re-open stays a plain, reported error', async () => {
      lapsed()
      f.payload.update = (async () => {
        throw new Error('connection lost')
      }) as never
      expect(await reopen()).toMatchObject({ status: 500, code: 'error' })
      expect(reportError).toHaveBeenCalled()
    })

    it('a number refusal on a write that gives no number back is not read as number-taken', async () => {
      world(business('awaiting_downpayment'))
      f.payload.update = (async () => ({
        docs: [],
        errors: [{ id: 7, message: 'The following field is invalid: Listing number' }],
      })) as never
      expect(await reopen()).toMatchObject({ status: 500, code: 'error' })
    })
  })

  it('refuses bad input and the wrong deadline', async () => {
    world(business('awaiting_downpayment'))
    const base = { payload: f.payload, actor: asStaff, businessId: 7, now: NOW, reason: 'x' }
    expect(await extendDeadline({ ...base, which: 'other', days: 3 })).toMatchObject({
      status: 400,
    })
    expect(await extendDeadline({ ...base, which: 'downpayment', days: 0 })).toMatchObject({
      status: 400,
    })
    expect(await extendDeadline({ ...base, which: 'balance', days: 3 })).toMatchObject({
      status: 409,
    })
  })
})

describe('the write', () => {
  it('is claimed on the status read under the lock: a change slipped in loses', async () => {
    world(business('awaiting_downpayment'))
    const original = f.payload.update.bind(f.payload)
    f.payload.update = (async (args: never) => {
      ;(f.row('businesses').submission as Row).status = 'rejected'
      return original(args)
    }) as never
    const r = await recordDownpayment({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
      ...money(),
    })
    expect(r).toMatchObject({ ok: false, status: 409, code: 'changed' })
    expect(notifyAfterChange).not.toHaveBeenCalled()
  })

  it('a failed save is a plain 500, reported, and asks for no email', async () => {
    world(reviewed())
    f.errorUpdate.add('businesses:7')
    const r = await acceptSubmission({
      payload: f.payload,
      actor: asStaff,
      businessId: 7,
      now: NOW,
    })
    expect(r).toMatchObject({ ok: false, status: 500, code: 'error' })
    expect(reportError).toHaveBeenCalled()
    expect(notifyAfterChange).not.toHaveBeenCalled()
  })

  it('writes only the submission (and the number on a re-open), never other listing fields', async () => {
    world(reviewed())
    await acceptSubmission({ payload: f.payload, actor: asStaff, businessId: 7, now: NOW })
    expect(Object.keys(f.updates[0]!.data)).toEqual(['submission'])
  })
})
