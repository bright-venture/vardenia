import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakePayload, type FakePayload } from '../lib/place-submission-fake'

vi.mock('../lib/report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('../lib/branches', async () => ({
  runInTransaction: (await import('../lib/place-submission-fake')).runInFakeTransaction,
}))
vi.mock('../lib/partner-lock', async () => ({
  advisoryLock: (await import('../lib/place-submission-fake')).fakeAdvisoryLock,
  placeSubmissionLockKey: (id: number | string) => `lock-${id}`,
}))

const { resendPaymentEmailEndpoint } = await import('./payment-endpoints')

const staff = { id: 2, collection: 'users', roles: ['staff'] }
const admin = { id: 1, collection: 'users', roles: ['admin'] }
const partner = { id: 9, collection: 'business-users', businesses: [7] }
let f: FakePayload

const call = async (user: unknown, body: unknown, raw = false) => {
  const res = (await resendPaymentEmailEndpoint.handler({
    payload: f.payload,
    user,
    json: raw
      ? async () => {
          throw new SyntaxError('bad json')
        }
      : async () => body,
  } as never)) as Response
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const sub = () =>
  f.row('businesses').submission as { status: string; history?: { step: string; by: unknown }[] }

beforeEach(() => {
  f = fakePayload({
    businesses: [
      {
        id: 7,
        name: 'Cafe',
        _status: 'draft',
        listingNumber: 3,
        submission: {
          status: 'awaiting_downpayment',
          reference: 'VD-7',
          ownerName: 'Sami',
          ownerEmail: 'o@e.com',
          history: [],
          payments: [],
          payment: {
            stage: 'none',
            price: 1000,
            downpaymentAmount: 500,
            currency: 'USD',
            downpaymentDueAt: '2026-12-01T12:00:00.000Z',
            submittedEmailSentAt: '2026-11-24T12:00:00.000Z',
          },
        },
      },
    ],
  })
})

describe('POST /api/resend-payment-email', () => {
  it('is a POST at its own path', () => {
    expect(resendPaymentEmailEndpoint).toMatchObject({
      path: '/resend-payment-email',
      method: 'post',
    })
  })

  it('refuses anyone but staff and admin, sending nothing', async () => {
    for (const user of [null, undefined, partner, { id: 3, collection: 'users', roles: [] }]) {
      const r = await call(user, { businessId: 7, event: 'E1' })
      expect(r).toEqual({ status: 403, body: { error: 'Staff only.', code: 'not-staff' } })
    }
    expect(f.emails).toHaveLength(0)
  })

  it('staff and admin may resend E1; the history says who, the status stays', async () => {
    expect(await call(staff, { businessId: 7, event: 'E1' })).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect(await call(admin, { businessId: 7, event: 'E1' })).toMatchObject({ status: 200 })
    expect(f.emails.map((e) => e.to)).toEqual(['o@e.com', 'o@e.com'])
    expect(f.emails[0]!.subject).toBe('Pay the downpayment for Cafe')
    expect(sub().status).toBe('awaiting_downpayment')
    expect(sub().history).toMatchObject([
      { step: 'email_resent', by: 2 },
      { step: 'email_resent', by: 1 },
    ])
  })

  it('has a strict body', async () => {
    const extra = await call(staff, { businessId: 7, event: 'E1', status: 'paid' })
    expect(extra).toEqual({
      status: 400,
      body: { error: 'Unexpected field: status.', code: 'bad-input' },
    })
    expect((await call(staff, [7])).status).toBe(400)
    expect((await call(staff, null, true)).status).toBe(400)
    expect(f.emails).toHaveLength(0)
  })

  it('only E1 and E3, and each only in its state', async () => {
    expect(await call(staff, { businessId: 7, event: 'E2' })).toMatchObject({
      status: 400,
      body: { code: 'bad-input' },
    })
    expect(await call(staff, { businessId: 7, event: 'E3' })).toMatchObject({
      status: 409,
      body: { code: 'wrong-state' },
    })
    expect(f.emails).toHaveLength(0)
  })
})
