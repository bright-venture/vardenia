import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakePayload, type FakePayload } from './place-submission-fake'

vi.mock('./report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('./auth-email', () => ({ siteOrigin: () => 'https://vardenia.example' }))
vi.mock('./branches', async () => ({
  runInTransaction: (await import('./place-submission-fake')).runInFakeTransaction,
}))
vi.mock('./partner-lock', async () => ({
  advisoryLock: (await import('./place-submission-fake')).fakeAdvisoryLock,
  placeSubmissionLockKey: (id: number | string) => `lock-${id}`,
}))
vi.mock('./place-payment-notify', () => ({ notifyAfterChange: vi.fn(async () => {}) }))

const { rejectSubmission, MAX_REASON_LENGTH } = await import('./place-rejection')

const staff = { id: 2, collection: 'users', roles: ['staff'] }
const admin = { id: 1, collection: 'users', roles: ['admin'] }

let f: FakePayload

const business = (over: Record<string, unknown> = {}, status = 'pending') => ({
  id: 7,
  name: 'Cafe Cedar',
  _status: 'draft',
  listingNumber: 12,
  submission: {
    status,
    reference: 'VD-7',
    ownerName: 'Sami',
    ownerEmail: 'sami@example.com',
    ownerPhone: '03 123 456',
  },
  ...over,
})

const reject = (over: Record<string, unknown> = {}) =>
  rejectSubmission({
    payload: f.payload,
    user: staff,
    businessId: 7,
    reason: 'We could not verify the address.',
    shareReason: false,
    ...over,
  })

beforeEach(() => {
  f = fakePayload({ businesses: [business()] })
})

describe('who may reject', () => {
  it.each([
    ['nobody', null],
    ['a partner', { id: 9, collection: 'business-users', businesses: [7] }],
    ['a guest', { id: 3, collection: 'customers' }],
    ['a guest with a roles field', { id: 3, collection: 'customers', roles: ['admin'] }],
  ])('refuses %s with 403 and changes nothing', async (_label, user) => {
    const result = await reject({ user })
    expect(result).toMatchObject({ ok: false, status: 403 })
    expect(f.updates).toHaveLength(0)
    expect(f.emails).toHaveLength(0)
  })

  it('lets staff and admin reject', async () => {
    expect((await reject({ user: staff })).ok).toBe(true)
    f = fakePayload({ businesses: [business()] })
    expect((await reject({ user: admin })).ok).toBe(true)
  })
})

describe('what is required', () => {
  it.each(['', '   ', undefined, 5])('refuses a missing reason (%s)', async (reason) => {
    expect(await reject({ reason })).toMatchObject({ ok: false, status: 400 })
    expect(f.updates).toHaveLength(0)
  })

  it('refuses a reason over the limit', async () => {
    expect(await reject({ reason: 'x'.repeat(MAX_REASON_LENGTH + 1) })).toMatchObject({
      ok: false,
      status: 400,
    })
  })

  it('refuses a business id that is not a number, and a business that does not exist', async () => {
    expect(await reject({ businessId: 'abc' })).toMatchObject({ ok: false, status: 400 })
    expect(await reject({ businessId: 99 })).toMatchObject({ ok: false, status: 404 })
  })
})

describe('which states may be rejected', () => {
  it.each(['approved', 'accepted', 'abandoned', 'lapsed', 'expired'])(
    'refuses %s with a plain message',
    async (status) => {
      f = fakePayload({ businesses: [business({}, status)] })
      const result = await reject()
      expect(result).toMatchObject({ ok: false, status: 409 })
      expect((result as { message: string }).message).toMatch(
        /in review, waiting for the downpayment/,
      )
      expect(f.updates).toHaveLength(0)
      expect(f.row('businesses').submission).toMatchObject({ status })
    },
  )

  it('says so when it was already rejected', async () => {
    f = fakePayload({ businesses: [business({}, 'rejected')] })
    expect((await reject()) as { message: string }).toMatchObject({
      message: 'This submission was already rejected.',
    })
  })

  it('refuses a published listing', async () => {
    f = fakePayload({ businesses: [business({ _status: 'published' })] })
    const result = await reject()
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect((result as { message: string }).message).toMatch(/published/)
    expect(f.updates).toHaveLength(0)
  })

  it.each(['pending', 'incomplete', 'awaiting_downpayment'])(
    'rejects a %s submission',
    async (status) => {
      f = fakePayload({ businesses: [business({}, status)] })
      expect((await reject()).ok).toBe(true)
    },
  )
})

describe('the rejection', () => {
  it('stores the reason, who and when, keeps the business a draft and frees the number', async () => {
    await reject({ shareReason: true })
    const row = f.row('businesses')
    expect(row.submission).toMatchObject({
      status: 'rejected',
      rejectionReason: 'We could not verify the address.',
      rejectionReasonShared: true,
      rejectedBy: 2,
      ownerEmail: 'sami@example.com',
    })
    expect(typeof (row.submission as { rejectedAt: string }).rejectedAt).toBe('string')
    expect(row._status).toBe('draft')
    expect(row.listingNumber).toBeNull()
  })

  it('claims the update on the current status, so a second rejection or a finish racing it loses', async () => {
    await reject()
    expect(JSON.stringify(f.updates[0])).not.toContain('forged')
    const second = await reject()
    expect(second).toMatchObject({ ok: false, status: 409 })
    expect(f.updates).toHaveLength(1)
  })

  it('reports a lost race (the row changed between the read and the write)', async () => {
    const original = f.payload.update.bind(f.payload)
    f.payload.update = (async (args: never) => {
      f.row('businesses').submission = {
        ...(f.row('businesses').submission as object),
        status: 'approved',
      }
      return original(args)
    }) as never
    expect(await reject()).toMatchObject({ ok: false, status: 409 })
  })

  it('returns a plain 500 when the save fails, and sends no email', async () => {
    f.errorUpdate.add('businesses:7')
    expect(await reject()).toMatchObject({ ok: false, status: 500 })
    expect(f.emails).toHaveLength(0)
  })
})

describe('the owner email', () => {
  it('goes to the owner with the reference, and the reason only when shared', async () => {
    await reject({ shareReason: false })
    expect(f.emails).toHaveLength(1)
    expect(f.emails[0]!.to).toBe('sami@example.com')
    expect(f.emails[0]!.html).toContain('VD-7')
    expect(f.emails[0]!.html).not.toContain('verify the address')

    f = fakePayload({ businesses: [business()] })
    await reject({ shareReason: true })
    expect(f.emails[0]!.html).toContain('We could not verify the address.')
    expect(f.emails[0]!.text).toContain('We could not verify the address.')
  })

  it('is in Arabic when asked, or when the owner writes their name in Arabic', async () => {
    await reject({ locale: 'ar' })
    expect(f.emails[0]!.html).toContain('lang="ar"')

    f = fakePayload({
      businesses: [
        business({ submission: { status: 'pending', ownerName: 'سامي', ownerEmail: 's@e.com' } }),
      ],
    })
    await reject()
    expect(f.emails[0]!.html).toContain('dir="rtl"')
  })

  it('does not stop the rejection when sending fails', async () => {
    f.failSend.value = true
    const result = await reject()
    expect(result).toEqual({ ok: true, emailed: false, refundDue: false })
    expect(f.row('businesses').submission).toMatchObject({ status: 'rejected' })
  })

  it('sends nothing when there is no owner email', async () => {
    f = fakePayload({ businesses: [business({ submission: { status: 'pending' } })] })
    expect(await reject()).toEqual({ ok: true, emailed: false, refundDue: false })
    expect(f.emails).toHaveLength(0)
  })
})

describe('not accepted after a downpayment (spec v4)', () => {
  it('sets the kind and refund due, asks for E5, and sends no plain email', async () => {
    const { notifyAfterChange } = await import('./place-payment-notify')
    vi.mocked(notifyAfterChange).mockClear()
    f = fakePayload({
      businesses: [
        {
          ...business(),
          submission: {
            ...business().submission,
            payments: [{ id: 'd1', type: 'downpayment', amount: 500, voided: false }],
            payment: { stage: 'downpayment_paid', price: 1000 },
          },
        },
      ],
    })
    expect(await reject()).toEqual({ ok: true, emailed: false, refundDue: true })
    expect(f.row('businesses').submission).toMatchObject({
      status: 'rejected',
      rejectionKind: 'not_accepted',
      payment: { stage: 'refund_due', received: 500 },
    })
    expect(f.emails).toHaveLength(0)
    expect(notifyAfterChange).toHaveBeenCalledWith('E5', expect.objectContaining({ businessId: 7 }))
  })

  it('passes the language staff chose to E5; automatic or unknown leaves it to the owner name', async () => {
    const { notifyAfterChange } = await import('./place-payment-notify')
    const paid = () =>
      fakePayload({
        businesses: [
          {
            ...business(),
            submission: {
              ...business().submission,
              payments: [{ id: 'd1', type: 'downpayment', amount: 500, voided: false }],
              payment: { stage: 'downpayment_paid', price: 1000 },
            },
          },
        ],
      })
    for (const [given, expected] of [
      ['ar', 'ar'],
      ['en', 'en'],
      [undefined, undefined],
      ['fr', undefined],
    ] as const) {
      vi.mocked(notifyAfterChange).mockClear()
      f = paid()
      await reject(given === undefined ? {} : { locale: given })
      const ctx = vi.mocked(notifyAfterChange).mock.calls[0]![1]
      expect(ctx.locale, String(given)).toBe(expected)
    }
  })

  it('records the rejection in the history, by the staff member, with the reason', async () => {
    await reject()
    expect((f.row('businesses').submission as { history: unknown[] }).history).toMatchObject([
      { step: 'rejected', by: 2, note: 'Not accepted: We could not verify the address.' },
    ])
  })
})
