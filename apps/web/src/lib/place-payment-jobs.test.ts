import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('./branches', async () => ({
  runInTransaction: (await import('./place-submission-fake')).runInFakeTransaction,
}))
vi.mock('./partner-lock', async () => ({
  advisoryLock: (await import('./place-submission-fake')).fakeAdvisoryLock,
  placeSubmissionLockKey: (id: number | string) => `lock-${id}`,
}))

import { reportError } from './report'
import { fakePayload, type FakePayload } from './place-submission-fake'
import { runPaymentJobs } from './place-payment-jobs'

type Row = Record<string, unknown>
let f: FakePayload

const DAY = 24 * 60 * 60 * 1000
const SENT = new Date('2026-11-24T12:00:00.000Z')
const DOWN_DUE = new Date(SENT.getTime() + 7 * DAY) // 1 December
const REMIND_DOWN = new Date(SENT.getTime() + 5 * DAY) // 29 November
const BAL_DUE = new Date('2026-12-24T12:00:00.000Z')
const REMIND_BAL = new Date(BAL_DUE.getTime() - 3 * DAY) // 21 December
const ms = (d: Date, delta = 0) => new Date(d.getTime() + delta)

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

function business(id: number, status: string, payment: Row = {}, payments: Row[] = []) {
  return {
    id,
    name: `Place ${id}`,
    _status: 'draft',
    issue: 3,
    listingNumber: id,
    submission: {
      status,
      reference: `VD-${id}`,
      ownerName: 'Sami',
      ownerEmail: `owner${id}@example.com`,
      submittedAt: SENT.toISOString(),
      history: [],
      payments,
      payment: {
        stage: payments.length ? 'downpayment_paid' : 'none',
        price: 1000,
        downpaymentAmount: 500,
        currency: 'USD',
        downpaymentDueAt: DOWN_DUE.toISOString(),
        balanceDeadlineDays: 30,
        ...payment,
      },
    },
  }
}

const awaiting = (id = 1, payment: Row = {}) => business(id, 'awaiting_downpayment', payment)
const accepted = (id = 2, payment: Row = {}) =>
  business(id, 'accepted', { balanceDueAt: BAL_DUE.toISOString(), ...payment }, [DOWN])

const world = (...docs: Row[]) => {
  f = fakePayload({ businesses: docs as never })
  return f
}
const row = (id: number) =>
  f.tables.businesses!.find((d) => d.id === id) as unknown as Row & {
    listingNumber: unknown
    submission: Row & { payment: Row }
  }
const run = (now: Date) => runPaymentJobs({ payload: f.payload, now })
const ZERO = {
  lapsed: 0,
  rejectedUnpaid: 0,
  downpaymentReminders: 0,
  balanceReminders: 0,
  publishedEmails: 0,
  skipped: 0,
  failed: 0,
}

beforeEach(() => {
  vi.mocked(reportError).mockClear()
  process.env.PLACE_SUBMISSION_ALERT_TO = 'team@example.com'
})

describe('(b) downpayment reminder, E1c', () => {
  it('not a millisecond before day 5', async () => {
    world(awaiting())
    expect(await run(ms(REMIND_DOWN, -1))).toEqual(ZERO)
    expect(f.emails).toHaveLength(0)
  })

  it('at day 5 exactly: sent once; a second run sends nothing', async () => {
    world(awaiting())
    expect(await run(REMIND_DOWN)).toEqual({ ...ZERO, downpaymentReminders: 1 })
    expect(f.emails).toHaveLength(1)
    expect(f.emails[0]!.subject).toBe('Reminder: the downpayment for Place 1')
    expect(row(1).submission.payment.downpaymentReminderSentAt).toBe(REMIND_DOWN.toISOString())
    expect(await run(ms(REMIND_DOWN, 60_000))).toEqual(ZERO)
    expect(f.emails).toHaveLength(1)
    expect(row(1).submission.status).toBe('awaiting_downpayment')
  })

  it('none when the setting is 0', async () => {
    world(awaiting())
    f.settings.value = { magazinePlaces: { downpaymentReminderDay: 0 } }
    expect(await run(REMIND_DOWN)).toEqual(ZERO)
  })
})

describe('(a) lapse, E7', () => {
  it('not a millisecond before the deadline', async () => {
    world(awaiting(1, { downpaymentReminderSentAt: REMIND_DOWN.toISOString() }))
    expect(await run(ms(DOWN_DUE, -1))).toEqual(ZERO)
    expect(row(1).submission.status).toBe('awaiting_downpayment')
  })

  it('at the deadline exactly: lapsed, number released, E7 once', async () => {
    world(awaiting(1, { downpaymentReminderSentAt: REMIND_DOWN.toISOString() }))
    expect(await run(DOWN_DUE)).toEqual({ ...ZERO, lapsed: 1 })
    expect(row(1).submission.status).toBe('lapsed')
    expect(row(1).listingNumber).toBeNull()
    expect(f.emails.map((e) => e.subject)).toEqual(['The time to pay the downpayment is over'])
    expect(f.emails[0]!.html).toContain('1 (released)')
    expect(await run(ms(DOWN_DUE, 15 * 60_000))).toEqual(ZERO)
    expect(f.emails).toHaveLength(1)
  })

  it('a late run lapses without sending the reminder first', async () => {
    world(awaiting())
    expect(await run(ms(DOWN_DUE, DAY))).toEqual({ ...ZERO, lapsed: 1 })
    expect(f.emails).toHaveLength(1)
  })
})

describe('(c) reminder of the rest, E4', () => {
  it('not a millisecond before 3 days before', async () => {
    world(accepted())
    expect(await run(ms(REMIND_BAL, -1))).toEqual(ZERO)
  })

  it('3 days before exactly: sent once; a second run sends nothing', async () => {
    world(accepted())
    expect(await run(REMIND_BAL)).toEqual({ ...ZERO, balanceReminders: 1 })
    expect(f.emails[0]!.subject).toBe('Reminder: the rest for Place 2 is due on 24 December 2026')
    expect(f.emails[0]!.html).toContain('$500')
    expect(await run(ms(REMIND_BAL, DAY))).toEqual(ZERO)
    expect(f.emails).toHaveLength(1)
  })

  it('none when the setting is 0', async () => {
    world(accepted())
    f.settings.value = { magazinePlaces: { balanceReminderDaysBefore: 0 } }
    expect(await run(REMIND_BAL)).toEqual(ZERO)
  })
})

describe('(d) did not pay the rest, E6', () => {
  it('not a millisecond before the deadline', async () => {
    world(accepted(2, { balanceReminderSentAt: REMIND_BAL.toISOString() }))
    expect(await run(ms(BAL_DUE, -1))).toEqual(ZERO)
    expect(row(2).submission.status).toBe('accepted')
  })

  it('at the deadline exactly: rejected (unpaid), kept, released, owner and team told once', async () => {
    world(accepted(2, { balanceReminderSentAt: REMIND_BAL.toISOString() }))
    expect(await run(BAL_DUE)).toEqual({ ...ZERO, rejectedUnpaid: 1 })
    const s = row(2).submission
    expect(s.status).toBe('rejected')
    expect(s.rejectionKind).toBe('unpaid')
    expect(s.payment.stage).toBe('kept')
    expect(row(2).listingNumber).toBeNull()
    expect(f.emails.map((e) => e.to).sort()).toEqual(['owner2@example.com', 'team@example.com'])
    expect(await run(ms(BAL_DUE, DAY))).toEqual(ZERO)
    expect(f.emails).toHaveLength(2)
  })
})

describe('every run', () => {
  it('leaves every other state alone', async () => {
    world(
      business(3, 'pending', {}, [DOWN]),
      business(4, 'paid', { balanceDueAt: BAL_DUE.toISOString() }, [DOWN]),
      business(5, 'incomplete'),
      business(6, 'rejected'),
      business(7, 'lapsed'),
      business(8, 'approved'),
    )
    expect(await run(ms(BAL_DUE, 365 * DAY))).toEqual(ZERO)
    expect(f.emails).toHaveLength(0)
    expect(f.updates).toHaveLength(0)
  })

  it('handles all four at once and returns the counts', async () => {
    world(
      awaiting(1), // lapses
      awaiting(3, {
        downpaymentDueAt: ms(BAL_DUE, 3 * DAY).toISOString(),
        downpaymentReminderSentAt: null,
      }),
      accepted(2), // rejected
      accepted(4, { balanceDueAt: ms(BAL_DUE, 2 * DAY).toISOString() }), // reminded
    )
    // Business 3 was sent on SENT, so its reminder day has long come.
    expect(await run(BAL_DUE)).toEqual({
      lapsed: 1,
      rejectedUnpaid: 1,
      downpaymentReminders: 1,
      balanceReminders: 1,
      publishedEmails: 0,
      skipped: 0,
      failed: 0,
    })
    expect(await run(ms(BAL_DUE, 60_000))).toEqual(ZERO)
  })

  it('one failure does not stop the others, and is reported', async () => {
    world(awaiting(1), awaiting(3), awaiting(5))
    f.failUpdate.add('businesses:3')
    const r = await run(DOWN_DUE)
    expect(r).toEqual({ ...ZERO, lapsed: 2, failed: 1 })
    expect(row(1).submission.status).toBe('lapsed')
    expect(row(3).submission.status).toBe('awaiting_downpayment')
    expect(row(5).submission.status).toBe('lapsed')
    expect(reportError).toHaveBeenCalled()
  })

  it('a reminder that cannot be sent counts as failed and is tried again next run', async () => {
    world(awaiting(1))
    f.failSend.value = true
    expect(await run(REMIND_DOWN)).toEqual({ ...ZERO, failed: 1 })
    expect(row(1).submission.payment.downpaymentReminderSentAt).toBeUndefined()
    f.failSend.value = false
    expect(await run(ms(REMIND_DOWN, 15 * 60_000))).toEqual({ ...ZERO, downpaymentReminders: 1 })
  })

  it('an unexpected throw for one business is isolated too', async () => {
    world(awaiting(1), accepted(2))
    const find = f.payload.find.bind(f.payload)
    // The first listing comes back with one row the job cannot read.
    let calls = 0
    f.payload.find = (async (args: never) => {
      const out = await find(args)
      return calls++ === 0 ? { ...out, docs: [null, ...out.docs] } : out
    }) as never
    const r = await run(BAL_DUE)
    expect(r).toEqual({ ...ZERO, lapsed: 1, rejectedUnpaid: 1, failed: 1 })
  })

  it('never acts on a business whose state changed between the list and the lock', async () => {
    // Listed as due, then (before the lock) paid, extended or rejected by staff.
    const cases: [Row, (r: ReturnType<typeof row>) => void, Date][] = [
      [awaiting(1), (r) => Object.assign(r.submission, { status: 'pending' }), DOWN_DUE],
      [
        awaiting(1),
        (r) => (r.submission.payment.downpaymentDueAt = ms(DOWN_DUE, 5 * DAY).toISOString()),
        DOWN_DUE,
      ],
      [awaiting(1), (r) => Object.assign(r.submission, { status: 'pending' }), REMIND_DOWN],
      [
        awaiting(1),
        (r) => (r.submission.payment.downpaymentReminderSentAt = REMIND_DOWN.toISOString()),
        REMIND_DOWN,
      ],
      [accepted(1), (r) => Object.assign(r.submission, { status: 'paid' }), BAL_DUE],
      [
        accepted(1),
        (r) => (r.submission.payment.balanceDueAt = ms(BAL_DUE, 10 * DAY).toISOString()),
        BAL_DUE,
      ],
      [accepted(1), (r) => Object.assign(r.submission, { status: 'rejected' }), REMIND_BAL],
    ]
    for (const [doc, change, at] of cases) {
      world(doc)
      const find = f.payload.find.bind(f.payload)
      f.payload.find = (async (args: never) => {
        const out = await find(args)
        change(row(1))
        return out
      }) as never
      const r = await run(at)
      expect(r).toEqual({ ...ZERO, skipped: 1 })
      expect(f.emails).toHaveLength(0)
      // Nothing was written.
      expect(f.updates).toHaveLength(0)
    }
  })
})

describe('(e) E8 sweep: published, never emailed', () => {
  const PUBLISHED_AT = new Date('2026-12-26T09:00:00.000Z')
  const published = (id: number, over: Row = {}, payment: Row = {}) => {
    const b = business(id, 'approved', { stage: 'fully_paid', ...payment }, [DOWN])
    return { ...b, _status: 'published', contractStartsAt: PUBLISHED_AT.toISOString(), ...over }
  }

  it('sends E8 once to a listing whose email never went out; a second run sends nothing', async () => {
    world(published(1))
    expect(await run(ms(PUBLISHED_AT, 60 * 60_000))).toEqual({ ...ZERO, publishedEmails: 1 })
    expect(f.emails).toHaveLength(1)
    expect(f.emails[0]!.to).toBe('owner1@example.com')
    expect(row(1).submission.payment.publishedEmailSentAt).toBeTruthy()
    expect(await run(ms(PUBLISHED_AT, 2 * 60 * 60_000))).toEqual(ZERO)
    expect(f.emails).toHaveLength(1)
  })

  it('leaves alone a listing already emailed, a draft, an older listing and an old contract', async () => {
    world(
      published(1, {}, { publishedEmailSentAt: PUBLISHED_AT.toISOString() }),
      published(2, { _status: 'draft' }),
      // An older listing: approved and published, but never through the paid flow.
      published(3, {}, { stage: 'none' }),
      published(4, {}, { stage: null }),
      // Published long ago: never emailed out of the blue.
      published(5, { contractStartsAt: ms(PUBLISHED_AT, -30 * DAY).toISOString() }),
      published(6, { contractStartsAt: null }),
    )
    expect(await run(ms(PUBLISHED_AT, DAY))).toEqual(ZERO)
    expect(f.emails).toHaveLength(0)
    expect(f.updates).toHaveLength(0)
  })

  it('a failed send counts as failed, leaves the marker empty, and is tried again', async () => {
    world(published(1), published(2))
    f.failSend.value = true
    expect(await run(ms(PUBLISHED_AT, DAY))).toEqual({ ...ZERO, failed: 2 })
    expect(row(1).submission.payment.publishedEmailSentAt).toBeUndefined()
    f.failSend.value = false
    expect(await run(ms(PUBLISHED_AT, DAY + 15 * 60_000))).toEqual({
      ...ZERO,
      publishedEmails: 2,
    })
  })

  it('one listing throwing does not stop the others, nor the payment steps before it', async () => {
    world(published(1), awaiting(3))
    const find = f.payload.find.bind(f.payload)
    let calls = 0
    f.payload.find = (async (args: never) => {
      const out = await find(args)
      return calls++ === 1 ? { ...out, docs: [null, ...out.docs] } : out
    }) as never
    expect(await run(ms(PUBLISHED_AT, DAY))).toEqual({
      ...ZERO,
      lapsed: 1,
      publishedEmails: 1,
      failed: 1,
    })
    expect(reportError).toHaveBeenCalled()
  })

  it('a failed sweep query is reported and counted, and keeps the payment steps', async () => {
    world(awaiting(3))
    const find = f.payload.find.bind(f.payload)
    let calls = 0
    f.payload.find = (async (args: never) => {
      if (calls++ === 1) throw new Error('db down')
      return find(args)
    }) as never
    expect(await run(DOWN_DUE)).toEqual({ ...ZERO, lapsed: 1, failed: 1 })
    expect(row(3).submission.status).toBe('lapsed')
  })

  it('skips a listing whose email went out between the list and the lock', async () => {
    world(published(1))
    const find = f.payload.find.bind(f.payload)
    let calls = 0
    f.payload.find = (async (args: never) => {
      const out = structuredClone(await find(args))
      // After the sweep's list was read (the fake hands out live rows).
      if (calls++ === 1) row(1).submission.payment.publishedEmailSentAt = PUBLISHED_AT.toISOString()
      return out
    }) as never
    // The listed copy still shows the marker unset; under the lock it is set.
    expect(await run(ms(PUBLISHED_AT, DAY))).toEqual({ ...ZERO, skipped: 1 })
    expect(f.emails).toHaveLength(0)
  })
})
