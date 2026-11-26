import { describe, expect, it } from 'vitest'
import { downpaymentFor } from './place-payment-rules'
import {
  acceptBlocked,
  beirutLocalNow,
  beirutLocalToIso,
  canUndo,
  checkAmount,
  daysLeftWords,
  emailNotice,
  expectedAmount,
  layoutWords,
  expectedDownpayment,
  historyRows,
  moneyBody,
  moneyDefaults,
  moneyFacts,
  moneyFormError,
  moneyRows,
  panelActions,
  panelView,
  publishHint,
  refusalWords,
  statusWords,
  type PanelAction,
  type PanelDoc,
  type PanelEntry,
  whishTimeMax,
} from './payment-panel'

const STAFF = { roles: ['staff'] }
const ADMIN = { roles: ['admin'] }
const PARTNER = { roles: ['partner'] }

const down = (over: Partial<PanelEntry> = {}): PanelEntry => ({
  id: 'd1',
  type: 'downpayment',
  amount: 500,
  currency: 'USD',
  senderNumber: '03123456',
  whishAt: '2026-11-20T10:00:00.000Z',
  method: 'whish',
  recordedBy: { id: 4, name: 'Rana' },
  recordedAt: '2026-11-20T11:00:00.000Z',
  voided: false,
  forfeited: false,
  ...over,
})

const doc = (
  status: string | null,
  over: {
    stage?: string
    payments?: PanelEntry[]
    published?: boolean
    payment?: Record<string, unknown>
    history?: PanelDoc['submission'] extends infer S
      ? S extends { history?: infer H }
        ? H
        : never
      : never
    rejectionKind?: string
    ownerEmail?: string | null
    issue?: number | null
  } = {},
): PanelDoc => ({
  id: 7,
  _status: over.published ? 'published' : 'draft',
  issue: over.issue === undefined ? 3 : over.issue,
  submission: {
    status,
    ownerName: 'Sami',
    ownerEmail: over.ownerEmail === undefined ? 'sami@example.com' : over.ownerEmail,
    ownerPhone: '03 123 456',
    rejectionKind: over.rejectionKind ?? null,
    payments: over.payments ?? [],
    history: over.history ?? [],
    payment: {
      stage: over.stage ?? 'none',
      price: 1000,
      downpaymentAmount: 500,
      currency: 'USD',
      submittedEmailSentAt: '2026-11-19T10:00:00.000Z',
      acceptedEmailSentAt: '2026-11-21T10:00:00.000Z',
      ...over.payment,
    },
  },
})

const actions = (d: PanelDoc, user: { roles: string[] } = STAFF) =>
  panelActions(panelView(d), user, d)

describe('panelActions: the PRD page 5 table, per status and role', () => {
  const table: [string, PanelDoc, PanelAction[], PanelAction[]][] = [
    [
      'awaiting downpayment',
      doc('awaiting_downpayment'),
      ['downpayment', 'resend', 'extend', 'rejectNotAccepted'],
      ['downpayment', 'resend', 'extend', 'rejectNotAccepted', 'waive'],
    ],
    [
      'in review, downpayment paid',
      doc('pending', { stage: 'downpayment_paid', payments: [down()] }),
      ['accept', 'rejectNotAccepted'],
      ['accept', 'rejectNotAccepted'],
    ],
    [
      'in review, waived',
      doc('pending', { stage: 'waived' }),
      ['accept', 'rejectNotAccepted'],
      ['accept', 'rejectNotAccepted'],
    ],
    [
      'old pending row with nothing paid',
      doc('pending', { stage: 'none' }),
      ['rejectNotAccepted'],
      ['rejectNotAccepted'],
    ],
    [
      'accepted',
      doc('accepted', { stage: 'downpayment_paid', payments: [down()] }),
      ['balance', 'resend', 'extend', 'rejectUnpaid'],
      ['balance', 'resend', 'extend', 'rejectUnpaid'],
    ],
    ['fully paid', doc('paid', { stage: 'fully_paid' }), [], []],
    [
      'rejected, refund due',
      doc('rejected', { stage: 'refund_due', payments: [down()] }),
      ['refund'],
      ['refund'],
    ],
    ['rejected, refunded', doc('rejected', { stage: 'refunded' }), [], []],
    ['rejected, kept', doc('rejected', { stage: 'kept' }), [], []],
    [
      'lapsed, its number on file',
      doc('lapsed', { payment: { lapsedListingNumber: 12 } }),
      ['extend'],
      ['extend'],
    ],
    // The server refuses a re-open with no number (or no issue) to give back.
    ['lapsed, no number on file', doc('lapsed'), [], []],
    [
      'lapsed, no issue',
      doc('lapsed', { payment: { lapsedListingNumber: 12 }, issue: null }),
      [],
      [],
    ],
    // The server cannot resend to nobody.
    [
      'awaiting downpayment, no owner email',
      doc('awaiting_downpayment', { ownerEmail: '' }),
      ['downpayment', 'extend', 'rejectNotAccepted'],
      ['downpayment', 'extend', 'rejectNotAccepted', 'waive'],
    ],
    [
      'accepted, no owner email',
      doc('accepted', { stage: 'downpayment_paid', payments: [down()], ownerEmail: null }),
      ['balance', 'extend', 'rejectUnpaid'],
      ['balance', 'extend', 'rejectUnpaid'],
    ],
    ['incomplete', doc('incomplete'), ['rejectNotAccepted'], ['rejectNotAccepted']],
    ['abandoned', doc('abandoned'), [], []],
    ['approved', doc('approved', { published: true, stage: 'fully_paid' }), [], []],
    ['expired', doc('expired'), [], []],
    ['no status (staff-made listing)', doc(null), [], []],
  ]

  it.each(table)('%s', (_, d, staff, admin) => {
    expect(actions(d, STAFF)).toEqual(staff)
    expect(actions(d, ADMIN)).toEqual(admin)
  })

  it('shows nothing to someone who is not staff', () => {
    expect(actions(doc('awaiting_downpayment'), PARTNER)).toEqual([])
    const d = doc('awaiting_downpayment')
    expect(panelActions(panelView(d), null, d)).toEqual([])
  })

  it('shows nothing on a published listing, whatever the status says', () => {
    for (const s of ['awaiting_downpayment', 'pending', 'accepted', 'lapsed']) {
      expect(actions(doc(s, { published: true, stage: 'downpayment_paid' }), ADMIN)).toEqual([])
    }
  })
})

describe('canUndo', () => {
  const pending = doc('pending', { stage: 'downpayment_paid', payments: [down()] })

  it('is for admins only', () => {
    expect(canUndo(panelView(pending), 'd1', ADMIN)).toBe(true)
    expect(canUndo(panelView(pending), 'd1', STAFF)).toBe(false)
  })

  it('follows the server: no undo of a voided line, a decided downpayment, or on a published listing', () => {
    const voided = doc('pending', { stage: 'downpayment_paid', payments: [down({ voided: true })] })
    expect(canUndo(panelView(voided), 'd1', ADMIN)).toBe(false)
    const accepted = doc('accepted', { stage: 'downpayment_paid', payments: [down()] })
    expect(canUndo(panelView(accepted), 'd1', ADMIN)).toBe(false)
    const published = doc('approved', { published: true, payments: [down()] })
    expect(canUndo(panelView(published), 'd1', ADMIN)).toBe(false)
    expect(canUndo(panelView(pending), undefined, ADMIN)).toBe(false)
  })

  it('allows undoing a payment of the rest', () => {
    const paid = doc('paid', {
      stage: 'fully_paid',
      payments: [down(), down({ id: 'b1', type: 'balance', whishAt: '2026-11-22T10:00:00.000Z' })],
    })
    expect(canUndo(panelView(paid), 'b1', ADMIN)).toBe(true)
  })
})

describe('words and hints', () => {
  it('names each status plainly', () => {
    expect(statusWords(doc('pending', { stage: 'waived' }))).toBe('In review (downpayment waived)')
    expect(statusWords(doc('rejected', { rejectionKind: 'unpaid' }))).toBe(
      'Rejected: did not pay the rest',
    )
    expect(statusWords(doc('rejected', { rejectionKind: 'not_accepted' }))).toBe(
      'Rejected: not accepted',
    )
    expect(statusWords(doc('approved', { published: true }))).toBe('Published')
  })

  it('gives the publish hint', () => {
    expect(publishHint(doc('paid'))).toBe('Fully paid: ready to publish.')
    for (const s of ['awaiting_downpayment', 'pending', 'accepted', 'incomplete']) {
      expect(publishHint(doc(s))).toBe('Cannot publish until fully paid.')
    }
    expect(publishHint(doc('rejected'))).toMatch(/closed/)
    expect(publishHint(doc('approved', { published: true }))).toBeNull()
    expect(publishHint(doc(null))).toBeNull()
  })

  it('says why Accept is missing on an old row', () => {
    expect(acceptBlocked(panelView(doc('pending', { stage: 'none' })))).toMatch(/downpayment/)
    expect(acceptBlocked(panelView(doc('pending', { stage: 'downpayment_paid' })))).toBeNull()
  })

  it('prompts a resend when the pay email did not go, and says a re-open sent it automatically', () => {
    expect(
      emailNotice(doc('awaiting_downpayment', { payment: { submittedEmailSentAt: null } })),
    ).toMatch(/has not gone out. Use Resend email/)
    const reopened = doc('awaiting_downpayment', {
      history: [{ step: 'deadline_extended', note: 'Re-opened with page number 12: ...' }],
    })
    expect(emailNotice(reopened)).toMatch(/sent again automatically/)
    expect(emailNotice(doc('awaiting_downpayment'))).toBeNull()
    expect(emailNotice(doc('accepted', { payment: { acceptedEmailSentAt: null } }))).toMatch(/E3/)
  })

  it('says there is no owner email instead of prompting a resend that would be refused', () => {
    expect(
      emailNotice(
        doc('awaiting_downpayment', { ownerEmail: '', payment: { submittedEmailSentAt: null } }),
      ),
    ).toMatch(/no owner email/)
    expect(
      emailNotice(doc('accepted', { ownerEmail: null, payment: { acceptedEmailSentAt: null } })),
    ).toMatch(/no owner email/)
  })

  it('words days left', () => {
    expect(daysLeftWords(5)).toBe('5 days left')
    expect(daysLeftWords(1)).toBe('1 day left')
    expect(daysLeftWords(0)).toBe('due now')
    expect(daysLeftWords(-1)).toBe('overdue by 1 day')
    expect(daysLeftWords(-3)).toBe('overdue by 3 days')
  })
})

describe('moneyFacts', () => {
  const now = new Date('2026-11-24T10:00:00.000Z')

  it('counts from the lines, ignoring undone ones, with the next deadline', () => {
    const d = doc('accepted', {
      stage: 'downpayment_paid',
      payments: [down(), down({ id: 'x', amount: 100, voided: true })],
      payment: { balanceDueAt: '2026-11-29T09:00:00.000Z' },
    })
    expect(moneyFacts(d, now)).toMatchObject({
      price: 1000,
      downpaymentExpected: 500,
      received: 500,
      stillToPay: 500,
      refunded: 0,
      toRefund: 0,
      deadline: { label: 'Rest due', days: 5 },
    })
  })

  it('shows what is to return while a refund is due', () => {
    const d = doc('rejected', {
      stage: 'refund_due',
      payments: [down(), { ...down({ id: 'r', type: 'refund', amount: 200 }) }],
    })
    expect(moneyFacts(d, now)).toMatchObject({ refunded: 200, toRefund: 300, deadline: null })
  })

  it('expects the Settings percent of the price when no downpayment was copied, like the engine', () => {
    const d = doc('awaiting_downpayment', { payment: { downpaymentAmount: null } })
    expect(moneyFacts(d, now).downpaymentExpected).toBeNull()
    expect(moneyFacts(d, now, 40).downpaymentExpected).toBe(downpaymentFor(1000, 40))
    expect(expectedDownpayment(d, 33.3)).toBe(downpaymentFor(1000, 33.3))
    // A copied amount always wins over the Settings.
    expect(expectedDownpayment(doc('awaiting_downpayment'), 40)).toBe(500)
    expect(expectedAmount('downpayment', d, 40)).toBe(400)
    expect(moneyDefaults('downpayment', d, 40).amount).toBe('400')
    // The note rule then matches the server's: a different amount needs one.
    expect(
      checkAmount('downpayment', '500', expectedAmount('downpayment', d, 40), 'USD'),
    ).toMatchObject({
      noteRequired: true,
    })
    expect(
      checkAmount('downpayment', '400', expectedAmount('downpayment', d, 40), 'USD'),
    ).toMatchObject({
      noteRequired: false,
    })
    // While the percent is unknown, the note is asked for rather than guessed.
    expect(checkAmount('downpayment', '500', null, 'USD')).toMatchObject({ noteRequired: true })
  })

  it('uses the downpayment deadline while it is awaited', () => {
    const d = doc('awaiting_downpayment', {
      payment: { downpaymentDueAt: '2026-11-23T10:00:00.000Z' },
    })
    expect(moneyFacts(d, now).deadline).toMatchObject({ label: 'Downpayment due', days: -1 })
  })
})

describe('money forms', () => {
  it('prefills the downpayment, the rest and the refund', () => {
    expect(moneyDefaults('downpayment', doc('awaiting_downpayment'))).toEqual({
      amount: '500',
      method: 'whish',
      senderNumber: '03 123 456',
      whishAt: '',
      note: '',
    })
    const accepted = doc('accepted', {
      stage: 'downpayment_paid',
      payments: [down({ amount: 400 })],
    })
    expect(moneyDefaults('balance', accepted).amount).toBe('600')
    const refund = doc('rejected', {
      stage: 'refund_due',
      payments: [down({ senderNumber: '71123456' })],
    })
    expect(moneyDefaults('refund', refund)).toMatchObject({
      amount: '500',
      senderNumber: '71123456',
    })
  })

  it('warns and asks for a note when the downpayment differs', () => {
    expect(checkAmount('downpayment', '500', 500, 'USD')).toEqual({
      error: null,
      warning: null,
      noteRequired: false,
    })
    const c = checkAmount('downpayment', '450', 500, 'USD')
    expect(c.warning).toMatch(/expected downpayment is \$500/)
    expect(c.noteRequired).toBe(true)
  })

  it('allows a part of the rest with a note', () => {
    const c = checkAmount('balance', '200', 500, 'USD')
    expect(c.warning).toMatch(/stays Accepted/)
    expect(c.noteRequired).toBe(true)
    expect(checkAmount('balance', '600', 500, 'USD').warning).toMatch(/More than/)
  })

  it('refuses a refund over what is owed, allows less', () => {
    expect(checkAmount('refund', '600', 500, 'USD').error).toMatch(/more than the \$500/)
    expect(checkAmount('refund', '200', 500, 'USD')).toMatchObject({
      error: null,
      noteRequired: false,
    })
  })

  it('refuses an unreadable amount with the server words', () => {
    expect(checkAmount('downpayment', '0', 500, 'USD').error).toMatch(/more than 0/)
    expect(checkAmount('downpayment', '1.234', 500, 'USD').error).toMatch(/two decimals/)
  })

  it('lists what is missing before sending', () => {
    const base = {
      amount: '450',
      method: 'whish' as const,
      senderNumber: '03123456',
      whishAt: '',
      note: '',
    }
    const c = checkAmount('downpayment', '450', 500, 'USD')
    expect(moneyFormError('downpayment', base, c)).toMatch(/Whish/)
    expect(moneyFormError('downpayment', { ...base, whishAt: '2026-11-24T10:00' }, c)).toMatch(
      /note/,
    )
    expect(
      moneyFormError('downpayment', { ...base, whishAt: '2026-11-24T10:00', note: 'sent less' }, c),
    ).toBeNull()
    expect(moneyFormError('downpayment', { ...base, method: 'cash', note: 'x' }, c)).toBeNull()
    expect(
      moneyFormError(
        'refund',
        { ...base, senderNumber: '', whishAt: '2026-11-24T10:00' },
        checkAmount('refund', '450', 500, 'USD'),
      ),
    ).toBeNull()
  })

  it('builds a strict body with the Whish time in Lebanon time and its zone', () => {
    expect(
      moneyBody(7, {
        amount: '500',
        method: 'whish',
        senderNumber: ' 03123456 ',
        whishAt: '2026-11-24T14:30',
        note: '',
      }),
    ).toEqual({
      businessId: 7,
      amount: 500,
      method: 'whish',
      senderNumber: '03123456',
      whishAt: '2026-11-24T14:30:00+02:00',
    })
    expect(
      moneyBody(7, {
        amount: '500',
        method: 'cash',
        senderNumber: '',
        whishAt: '2026-11-24T14:30',
        note: ' n ',
      }),
    ).toEqual({ businessId: 7, amount: 500, method: 'cash', note: 'n' })
  })
})

describe("Lebanon's time", () => {
  it('writes the winter and summer offsets', () => {
    expect(beirutLocalToIso('2026-11-24T14:30')).toBe('2026-11-24T14:30:00+02:00')
    expect(beirutLocalToIso('2026-07-01T09:05')).toBe('2026-07-01T09:05:00+03:00')
    expect(new Date(beirutLocalToIso('2026-07-01T09:05')!).toISOString()).toBe(
      '2026-07-01T06:05:00.000Z',
    )
    expect(beirutLocalToIso('nope')).toBeNull()
    expect(beirutLocalToIso('2026-11-24')).toBeNull()
  })

  it("gives now as Lebanon's wall clock", () => {
    expect(beirutLocalNow(new Date('2026-11-24T10:00:30.000Z'))).toBe('2026-11-24T12:00')
    expect(whishTimeMax(new Date('2026-11-24T10:00:30.000Z'))).toBe('2026-11-24T12:10')
  })
})

describe('money list and history', () => {
  it('shows each line with sender, Whish time, who recorded it and its marks', () => {
    const d = doc('rejected', {
      stage: 'kept',
      payments: [
        down({ forfeited: true }),
        down({
          id: 'v',
          type: 'balance',
          amount: 12.5,
          voided: true,
          voidedBy: { id: 1, email: 'boss@x.com' },
          voidedAt: '2026-11-22T10:00:00.000Z',
          voidReason: 'typo',
        }),
      ],
    })
    const [first, second] = moneyRows(d)
    expect(first).toMatchObject({
      type: 'Downpayment',
      amount: '$500',
      method: 'Whish',
      sender: '03123456',
      mark: 'Kept (did not pay the rest)',
      voided: false,
    })
    expect(first!.recorded).toMatch(/^Rana, 20 Nov 2026/)
    expect(first!.whishAt).toMatch(/20 Nov 2026, 12:00/)
    expect(second).toMatchObject({ type: 'Rest of the price', amount: '$12.50', voided: true })
    expect(second!.mark).toMatch(/^Undone by boss@x.com on 22 Nov 2026.*: typo$/)
  })

  it('lists the history without the form-filling steps', () => {
    const d = doc('pending', {
      history: [
        { id: 'a', step: 'incomplete', at: '2026-11-19T10:00:00.000Z' },
        {
          id: 'b',
          step: 'downpayment_received',
          at: '2026-11-20T10:00:00.000Z',
          by: 4,
          note: '$500 by Whish',
        },
      ],
    })
    expect(historyRows(d, { downpayment_received: 'Downpayment received' })).toEqual([
      {
        key: 'b',
        label: 'Downpayment received',
        at: '20 Nov 2026, 12:00',
        by: 'user 4',
        note: '$500 by Whish',
      },
    ])
  })
})

describe('refusalWords', () => {
  it("shows the server's own sentence, or one for the code", () => {
    expect(refusalWords({ error: 'Write the reason first.', code: 'bad-input' }, 400)).toBe(
      'Write the reason first.',
    )
    expect(refusalWords({ code: 'number-taken' }, 409)).toMatch(/page number is taken/)
    expect(refusalWords({ code: 'no-price' }, 409)).toMatch(/no price/)
    expect(refusalWords(null, 403)).toBe('Only staff can do this.')
    expect(refusalWords(null, 500)).toMatch(/did not go through/)
  })
})

describe('layoutWords', () => {
  const slots = [
    { number: 1, page: 1, position: null, layout: 'full-page' },
    { number: 2, page: 2, position: 1, layout: 'half-page' },
  ]
  it('names the layout and where the number sits', () => {
    expect(
      layoutWords({ id: 1, pageLayout: 'half-page', listingNumber: 2, issue: { id: 1, slots } }),
    ).toBe('Half page, Page 2, position 1')
  })
  it('is the label alone without slots, and null for a legacy listing', () => {
    expect(layoutWords({ id: 1, pageLayout: 'full-page', issue: 1 })).toBe('Full page')
    expect(layoutWords({ id: 1 })).toBeNull()
  })
})
