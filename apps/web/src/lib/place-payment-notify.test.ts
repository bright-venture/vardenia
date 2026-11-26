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
import {
  EMAIL_MARKERS,
  PAYMENT_EVENTS,
  emailLocaleFor,
  notifyAfterChange,
  resendPaymentEmail,
  sendPaymentEmail,
  type PaymentEvent,
} from './place-payment-notify'
import { recordDownpayment, rejectNotAccepted } from './place-payments'
import { finishPlaceSubmission } from './place-submission-finish'
import { hashSessionToken } from './place-submission'

const NOW = new Date('2026-11-24T12:00:00.000Z')
const staff = { id: 2, collection: 'users', roles: ['staff'] }
const admin = { id: 1, collection: 'users', roles: ['admin'] }
const partner = { id: 9, collection: 'business-users', businesses: [7] }

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
      submittedAt: '2026-11-24T12:00:00.000Z',
      history: [],
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

/** A business in the state each event belongs to. */
const STATE: Record<PaymentEvent, () => Row> = {
  E1: () => business('awaiting_downpayment'),
  E1c: () => business('awaiting_downpayment'),
  E2: () => business('pending', {}, { stage: 'downpayment_paid' }, [DOWN]),
  E3: () =>
    business(
      'accepted',
      {},
      { stage: 'downpayment_paid', balanceDueAt: '2026-12-24T12:00:00.000Z' },
      [DOWN],
    ),
  E3paid: () =>
    business('paid', {}, { stage: 'fully_paid', balanceDueAt: null }, [{ ...DOWN, amount: 1000 }]),
  E4: () =>
    business(
      'accepted',
      {},
      { stage: 'downpayment_paid', balanceDueAt: '2026-12-24T12:00:00.000Z' },
      [DOWN],
    ),
  E5: () =>
    business(
      'rejected',
      { listingNumber: null, submission: { rejectionKind: 'not_accepted', rejectionReason: 'x' } },
      { stage: 'refund_due' },
      [DOWN],
    ),
  E6: () =>
    business(
      'rejected',
      { listingNumber: null, submission: { rejectionKind: 'unpaid', rejectionReason: 'x' } },
      { stage: 'kept', balanceDueAt: '2026-12-24T12:00:00.000Z' },
      [{ ...DOWN, forfeited: true }],
    ),
  E7: () => business('lapsed', { listingNumber: null }, { lapsedListingNumber: 12 }),
  E8: () =>
    business(
      'approved',
      { _status: 'published', contractEndsAt: '2027-11-24T12:00:00.000Z' },
      { stage: 'fully_paid' },
      [DOWN, { ...DOWN, id: 'b1', type: 'balance' }],
    ),
}

const world = (doc: Row) => {
  f = fakePayload({ businesses: [doc as never] })
  f.settings.value = { magazinePlaces: { whishNumber: '+961 79 300 350' } }
  return f
}
const sub = () => f.row('businesses').submission as Row & { payment: Row; history: Row[] }
const send = (event: PaymentEvent, extra: Row = {}) =>
  sendPaymentEmail(event, { payload: f.payload, businessId: 7, now: NOW, ...extra })
const ownerMails = () => f.emails.filter((e) => e.to === 'sami@example.com')

beforeEach(() => {
  vi.mocked(reportError).mockClear()
  process.env.PLACE_SUBMISSION_ALERT_TO = 'team@example.com'
})

describe('sendPaymentEmail', () => {
  it('knows the nine events of the spec (plus E3paid), each with its marker', () => {
    expect(PAYMENT_EVENTS).toEqual([
      'E1',
      'E1c',
      'E2',
      'E3',
      'E3paid',
      'E4',
      'E5',
      'E6',
      'E7',
      'E8',
    ])
    expect(new Set(Object.values(EMAIL_MARKERS)).size).toBe(9)
    // Accepted already fully paid shares E3's marker: one acceptance email, ever.
    expect(EMAIL_MARKERS.E3paid).toBe(EMAIL_MARKERS.E3)
  })

  it('E3paid: accepted with the price covered says there is nothing more to pay, once', async () => {
    world(STATE.E3paid())
    expect(await send('E3paid')).toBe('sent')
    expect(ownerMails()[0]!.text).toContain('nothing more to pay')
    expect(ownerMails()[0]!.text).not.toMatch(/Pay the rest/)
    expect(await send('E3')).toBe('not-applicable')
    expect(await send('E3paid')).toBe('already-sent')
    expect(ownerMails()).toHaveLength(1)
  })

  it('writes only the marker, so an admin edit made while the email was sent is kept', async () => {
    world(STATE.E2())
    const sendEmail = f.payload.sendEmail.bind(f.payload)
    f.payload.sendEmail = (async (message: never) => {
      await sendEmail(message)
      // Staff save the owner's phone and the terms meanwhile (no lock).
      const row = f.row('businesses') as unknown as { submission: Row & { terms: Row } }
      row.submission.ownerPhone = '71000000'
      row.submission.terms = { ...row.submission.terms, priceAtAcceptance: 1200 }
    }) as never
    expect(await send('E2')).toBe('sent')
    const write = f.updates.at(-1)!.data
    expect(write).toEqual({
      submission: { payment: { downpaymentEmailSentAt: NOW.toISOString() } },
    })
    expect(sub().ownerPhone).toBe('71000000')
    expect((sub().terms as Row).priceAtAcceptance).toBe(1200)
    expect(sub().payment.downpaymentEmailSentAt).toBe(NOW.toISOString())
  })

  it.each(PAYMENT_EVENTS)(
    '%s: sends once, stamps the marker, a second ask sends nothing',
    async (event) => {
      world(STATE[event]())
      // The engine passes the number it read before a rejection released it.
      expect(await send(event, { listingNumber: 12 })).toBe('sent')
      expect(ownerMails()).toHaveLength(1)
      expect(ownerMails()[0]!.html).toContain('VD-7')
      expect(ownerMails()[0]!.html).toContain('12')
      expect(sub().payment[EMAIL_MARKERS[event]]).toBe(NOW.toISOString())

      expect(await send(event)).toBe('already-sent')
      expect(ownerMails()).toHaveLength(1)
    },
  )

  it.each(PAYMENT_EVENTS)(
    '%s: the marker write changes no status and adds no history',
    async (event) => {
      world(STATE[event]())
      const before = structuredClone(f.row('businesses'))
      await send(event)
      const after = f.row('businesses') as unknown as Row & { submission: Row & { payment: Row } }
      const was = before as unknown as Row & { submission: Row & { payment: Row } }
      expect(after.submission.status).toBe(was.submission.status)
      expect(after.submission.payments).toEqual(was.submission.payments)
      // The hook keeps the stored history when no step happened (the fake drops it).
      expect(after.submission.history ?? []).toEqual([])
      expect({ ...after.submission.payment, [EMAIL_MARKERS[event]]: undefined }).toEqual({
        ...was.submission.payment,
        [EMAIL_MARKERS[event]]: undefined,
      })
    },
  )

  it('sends nothing when the state no longer fits the event', async () => {
    const wrong: [PaymentEvent, Row][] = [
      ['E1', business('pending')],
      ['E1c', business('lapsed')],
      ['E2', business('pending')], // no downpayment line
      ['E3', business('paid')],
      ['E3paid', business('accepted')],
      ['E4', business('rejected')],
      ['E5', business('rejected', { submission: { rejectionKind: 'not_accepted' } })], // stage none
      ['E6', business('rejected', { submission: { rejectionKind: 'not_accepted' } })],
      ['E7', business('awaiting_downpayment')],
      ['E8', business('approved', { _status: 'draft' })],
    ]
    for (const [event, doc] of wrong) {
      world(doc)
      expect([event, await send(event)]).toEqual([event, 'not-applicable'])
      expect(f.emails).toHaveLength(0)
      expect(f.updates).toHaveLength(0)
    }
  })

  it('a failed send is reported, leaves the marker empty, and a later ask sends it', async () => {
    world(STATE.E2())
    f.failSend.value = true
    expect(await send('E2')).toBe('failed')
    expect(sub().payment.downpaymentEmailSentAt).toBeUndefined()
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: 'place-payment.email' }),
    )
    f.failSend.value = false
    expect(await send('E2')).toBe('sent')
    expect(ownerMails()).toHaveLength(1)
  })

  it('without an owner email: nothing sent, nothing stamped', async () => {
    world(business('awaiting_downpayment', { submission: { ownerEmail: null } }))
    expect(await send('E1')).toBe('no-recipient')
    expect(f.emails).toHaveLength(0)
    expect(sub().payment.submittedEmailSentAt).toBeUndefined()
  })

  it('E6 goes to the owner and to the team, once', async () => {
    world(STATE.E6())
    expect(await send('E6')).toBe('sent')
    expect(f.emails.map((e) => e.to).sort()).toEqual(['sami@example.com', 'team@example.com'])
    expect(f.emails.find((e) => e.to === 'team@example.com')!.subject).toBe(
      'Did not pay the rest: Cafe Cedar',
    )
    expect(await send('E6')).toBe('already-sent')
    expect(f.emails).toHaveLength(2)
  })

  it('E6: a failed owner copy leaves the marker empty, even when the team copy went', async () => {
    world(STATE.E6())
    const sendEmail = f.payload.sendEmail.bind(f.payload)
    f.payload.sendEmail = (async (m: { to: string }) => {
      if (m.to === 'sami@example.com') throw new Error('owner bounce')
      return sendEmail(m as never)
    }) as never
    expect(await send('E6')).toBe('failed')
    expect(f.emails.map((e) => e.to)).toEqual(['team@example.com'])
    expect(sub().payment.unpaidEmailSentAt).toBeUndefined()
  })

  it('E6 still reaches the team when the owner has no email', async () => {
    world(business('rejected', { submission: { rejectionKind: 'unpaid', ownerEmail: null } }))
    expect(await send('E6')).toBe('sent')
    expect(f.emails.map((e) => e.to)).toEqual(['team@example.com'])
  })

  it('shows the page number a rejection released (given by the engine) or a lapse kept', async () => {
    world(STATE.E5())
    await send('E5', { listingNumber: 12 })
    expect(ownerMails()[0]!.html).toContain('12 (released)')
    world(STATE.E7())
    await send('E7')
    expect(ownerMails()[0]!.html).toContain('12 (released)')
  })

  it('puts the layout, issue and page the owner agreed to (the terms) in the layout line', async () => {
    world(
      business('awaiting_downpayment', {
        submission: {
          terms: { layout: 'Half page', issue: 'Summer 2027', page: 'Page 62, position 2' },
        },
      }),
    )
    await send('E1')
    const mail = ownerMails()[0]!
    expect(mail.text).toContain(
      'Layout: Half page · Issue: Summer 2027 · Page 62, position 2 · No. 12',
    )
    expect(mail.text).toContain('Listing number 12 is reserved for you.')
  })

  it('uses the company Whish number from the settings', async () => {
    world(STATE.E1())
    await send('E1')
    const mail = ownerMails()[0]!
    expect(mail.html).toContain('+961 79 300 350')
    expect(mail.text).toContain('https://wa.me/96179300350?text=')
    expect(mail.text).not.toContain('03123456')
    expect(mail.text).not.toContain('03 123 456')
  })

  it('writes in the form language, else Arabic for an Arabic name, else English', async () => {
    world(STATE.E1())
    await send('E1', { locale: 'ar' })
    expect(ownerMails()[0]!.html).toContain('dir="rtl"')
    expect(emailLocaleFor(undefined, 'سامي')).toBe('ar')
    expect(emailLocaleFor(undefined, 'Sami')).toBe('en')
    expect(emailLocaleFor('fr', 'سامي')).toBe('en')
    expect(emailLocaleFor('en', 'سامي')).toBe('en')
  })

  it('a guard read under the lock can stop it', async () => {
    world(STATE.E1c())
    expect(
      await sendPaymentEmail(
        'E1c',
        { payload: f.payload, businessId: 7, now: NOW },
        { guard: () => false },
      ),
    ).toBe('not-applicable')
    expect(f.emails).toHaveLength(0)
  })

  it('two asks at once send one email', async () => {
    world(STATE.E3())
    const results = await Promise.all([send('E3'), send('E3')])
    expect(results.sort()).toEqual(['already-sent', 'sent'])
    expect(ownerMails()).toHaveLength(1)
  })

  it('a missing business is not-applicable', async () => {
    world(STATE.E1())
    expect(await sendPaymentEmail('E1', { payload: f.payload, businessId: 99, now: NOW })).toBe(
      'not-applicable',
    )
  })
})

describe('notifyAfterChange', () => {
  it('never throws, even when everything fails', async () => {
    const broken = {
      findGlobal: () => {
        throw new Error('db down')
      },
      findByID: () => {
        throw new Error('db down')
      },
      logger: {
        info: () => {
          throw new Error('logger down')
        },
      },
    }
    await expect(
      notifyAfterChange('E5', { payload: broken as never, businessId: 7 }),
    ).resolves.toBeUndefined()
    expect(reportError).toHaveBeenCalled()
  })
})

describe('the engine asks for its emails after the change', () => {
  it('downpayment received: E2 is sent and stamped', async () => {
    world(business('awaiting_downpayment'))
    const r = await recordDownpayment({
      payload: f.payload,
      actor: { user: staff },
      businessId: 7,
      amount: 500,
      senderNumber: '03123456',
      whishAt: '2026-11-24T10:30:00Z',
      method: 'whish',
      now: NOW,
    })
    expect(r.ok).toBe(true)
    expect(ownerMails()).toHaveLength(1)
    expect(ownerMails()[0]!.subject).toBe('We received your downpayment')
    expect(sub().payment.downpaymentEmailSentAt).toBe(NOW.toISOString())
  })

  it('not accepted with money: E5 shows the page number the rejection released', async () => {
    world(business('pending', {}, { stage: 'downpayment_paid' }, [DOWN]))
    const r = await rejectNotAccepted({
      payload: f.payload,
      actor: { user: staff },
      businessId: 7,
      reason: 'Not a fit',
      now: NOW,
    })
    expect(r.ok).toBe(true)
    expect(f.row('businesses').listingNumber).toBeNull()
    expect(ownerMails()).toHaveLength(1)
    expect(ownerMails()[0]!.html).toContain('12 (released)')
    expect(ownerMails()[0]!.html).toContain('We will return your $500')
  })
})

describe('resendPaymentEmail (E1, E3)', () => {
  const resend = (user: unknown, body: Row) =>
    resendPaymentEmail({ payload: f.payload, user, now: NOW, ...body } as never)

  it('is staff and admin only', async () => {
    world(STATE.E1())
    for (const user of [null, undefined, partner, { id: 5, collection: 'users', roles: [] }]) {
      expect(await resend(user, { businessId: 7, event: 'E1' })).toMatchObject({
        ok: false,
        status: 403,
        code: 'not-staff',
      })
    }
    expect(f.emails).toHaveLength(0)
    expect(await resend(admin, { businessId: 7, event: 'E1' })).toEqual({ ok: true })
  })

  it('only E1 and E3, and a real business id', async () => {
    world(STATE.E1())
    for (const event of ['E2', 'E8', 'e1', '', undefined, 1]) {
      expect(await resend(staff, { businessId: 7, event })).toMatchObject({
        status: 400,
        code: 'bad-input',
      })
    }
    expect(await resend(staff, { businessId: 'x', event: 'E1' })).toMatchObject({ status: 400 })
    expect(f.emails).toHaveLength(0)
  })

  it('sends again even after the first, logs who did it, and changes no state', async () => {
    world(STATE.E3())
    await send('E3')
    expect(await resend(staff, { businessId: 7, event: 'E3' })).toEqual({ ok: true })
    expect(ownerMails()).toHaveLength(2)
    expect(sub().status).toBe('accepted')
    expect(sub().payment.stage).toBe('downpayment_paid')
    expect(sub().history).toMatchObject([
      { step: 'email_resent', by: 2, note: 'Email resent: pay the rest (E3)' },
    ])
  })

  it('is refused when that payment is no longer awaited', async () => {
    world(STATE.E2())
    expect(await resend(staff, { businessId: 7, event: 'E1' })).toMatchObject({
      status: 409,
      code: 'wrong-state',
    })
    expect(await resend(staff, { businessId: 7, event: 'E3' })).toMatchObject({ status: 409 })
    expect(f.emails).toHaveLength(0)
    expect(sub().history).toEqual([])
  })

  it('says so when the email cannot be sent, or has nowhere to go', async () => {
    world(STATE.E1())
    f.failSend.value = true
    expect(await resend(staff, { businessId: 7, event: 'E1' })).toMatchObject({
      ok: false,
      status: 500,
      code: 'error',
    })
    expect(sub().history).toEqual([])
    world(business('awaiting_downpayment', { submission: { ownerEmail: null } }))
    expect(await resend(staff, { businessId: 7, event: 'E1' })).toMatchObject({ status: 409 })
  })
})

describe('finish: the owner gets ONE email (E1), the team its alert', () => {
  it('no first-version confirmation besides E1', async () => {
    const TOKEN = 'tok-secret-123'
    f = fakePayload({
      businesses: [
        {
          id: 5,
          name: 'Cafe Nour',
          governorate: 'beirut',
          listingNumber: 12,
          issue: 7,
          heroImage: 100,
          logo: 101,
          submission: {
            status: 'incomplete',
            reference: 'VD-5',
            ownerName: 'Nour',
            ownerEmail: 'nour@example.com',
            ownerPhone: '+9617',
          },
        },
      ],
      'place-upload-sessions': [
        {
          id: 9,
          tokenHash: hashSessionToken(TOKEN),
          business: 5,
          expiresAt: '2026-11-24T12:30:00.000Z',
          logoReceived: true,
          heroReceived: true,
          createdAt: '2026-11-24T11:55:00.000Z',
          updatedAt: '2026-11-24T11:58:00.000Z',
        },
      ],
      issues: [{ id: 7, title: 'Summer 2027' }],
    })
    const r = await finishPlaceSubmission({
      payload: f.payload,
      token: TOKEN,
      acceptedTerms: true,
      now: NOW,
    })
    expect(r).toEqual({ ok: true, reference: 'VD-5' })
    const owner = f.emails.filter((e) => e.to === 'nour@example.com')
    expect(owner).toHaveLength(1)
    expect(owner[0]!.subject).toBe('Pay the downpayment for Cafe Nour')
    expect(owner[0]!.html).toContain('$500')
    expect(owner[0]!.html).toContain('1 December 2026')
    expect(f.emails.filter((e) => e.to === 'team@example.com')).toHaveLength(1)
    const s = f.row('businesses').submission as { payment: Row }
    expect(s.payment.submittedEmailSentAt).toBe(NOW.toISOString())

    // A replay of the finish sends nothing more.
    await finishPlaceSubmission({ payload: f.payload, token: TOKEN, acceptedTerms: true, now: NOW })
    expect(f.emails).toHaveLength(2)
  })
})
