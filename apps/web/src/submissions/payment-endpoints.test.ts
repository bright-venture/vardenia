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
vi.mock('../lib/place-payment-notify', () => ({ notifyAfterChange: vi.fn(async () => {}) }))

const { paymentEndpoints } = await import('./payment-endpoints')
const { rejectSubmissionEndpoint } = await import('./reject-endpoint')

const staff = { id: 2, collection: 'users', roles: ['staff'] }
const admin = { id: 1, collection: 'users', roles: ['admin'] }
let f: FakePayload

const endpoint = (path: string) => paymentEndpoints.find((e) => e.path === path)!

const call = async (path: string, user: unknown, body: unknown) => {
  const handler =
    path === '/reject-submission' ? rejectSubmissionEndpoint.handler : endpoint(path).handler
  const res = (await handler({
    payload: f.payload,
    user,
    json: async () => body,
  } as never)) as Response
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

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
          ownerEmail: 'o@e.com',
          payments: [],
          payment: { stage: 'none', price: 1000, downpaymentAmount: 500, currency: 'USD' },
        },
      },
    ],
  })
})

describe('payment endpoints', () => {
  it('are one POST each, on distinct paths', () => {
    const paths = paymentEndpoints.map((e) => e.path)
    expect(paths.sort()).toEqual([
      '/accept-submission',
      '/balance-received',
      '/downpayment-received',
      '/extend-deadline',
      '/refund-sent',
      '/reject-unpaid',
      '/undo-money-entry',
      '/waive-downpayment',
    ])
    for (const e of paymentEndpoints) expect(e.method).toBe('post')
  })

  it.each(paymentEndpoints.map((e) => e.path))(
    '%s: anonymous and partners get 403, nothing written',
    async (path) => {
      for (const user of [null, { id: 9, collection: 'business-users', businesses: [7] }]) {
        const res = await call(path, user, { businessId: 7 })
        expect(res.status).toBe(403)
      }
      expect(f.updates).toHaveLength(0)
    },
  )

  it.each([...paymentEndpoints.map((e) => e.path), '/reject-submission'])(
    '%s: refuses a field outside its allow-list, and a body that is not an object',
    async (path) => {
      const res = await call(path, admin, { businessId: 7, status: 'paid' })
      expect(res).toMatchObject({ status: 400, body: { code: 'bad-input' } })
      expect(res.body.error).toContain('status')
      expect((await call(path, admin, [7])).status).toBe(400)
      expect(f.updates).toHaveLength(0)
    },
  )

  it('answers a body that is not JSON with 400', async () => {
    const res = (await endpoint('/accept-submission').handler({
      payload: f.payload,
      user: staff,
      json: async () => {
        throw new Error('bad json')
      },
    } as never)) as Response
    expect(res.status).toBe(400)
  })

  it('staff record a downpayment and get the new state back', async () => {
    const res = await call('/downpayment-received', staff, {
      businessId: 7,
      amount: 500,
      senderNumber: '03 123 456',
      whishAt: '2026-11-24T10:30:00Z',
    })
    expect(res).toEqual({
      status: 200,
      body: {
        ok: true,
        status: 'pending',
        stage: 'downpayment_paid',
        received: 500,
        stillToPay: 500,
      },
    })
  })

  it('a refusal comes back with its status, plain message and code', async () => {
    const res = await call('/accept-submission', staff, { businessId: 7 })
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'wrong-state' })
    expect(String(res.body.error)).toMatch(/downpayment/)
  })

  it('admin-only actions refuse staff with 403 and accept an admin', async () => {
    expect((await call('/waive-downpayment', staff, { businessId: 7, reason: 'x' })).status).toBe(
      403,
    )
    const res = await call('/waive-downpayment', admin, {
      businessId: 7,
      reason: 'Friend of the house',
    })
    expect(res).toMatchObject({ status: 200, body: { status: 'pending', stage: 'waived' } })
  })

  it('there is no accept-without-payment or publish-override endpoint (lead decision)', () => {
    const paths = paymentEndpoints.map((e) => e.path)
    expect(paths).not.toContain('/accept-without-payment')
    expect(paths).not.toContain('/publish-override')
  })

  it.each([
    ['staff', staff],
    ['admin', admin],
  ])('%s can record the downpayment, then (after accept) the balance', async (_role, user) => {
    const down = await call('/downpayment-received', user, {
      businessId: 7,
      amount: 500,
      senderNumber: '03 123 456',
      whishAt: '2026-11-24T10:30:00Z',
    })
    expect(down).toMatchObject({ status: 200, body: { status: 'pending' } })
    expect((await call('/accept-submission', user, { businessId: 7 })).status).toBe(200)
    const rest = await call('/balance-received', user, {
      businessId: 7,
      amount: 500,
      senderNumber: '03 123 456',
      whishAt: '2026-11-24T11:30:00Z',
    })
    expect(rest).toMatchObject({
      status: 200,
      body: { ok: true, status: 'paid', stage: 'fully_paid', received: 1000, stillToPay: 0 },
    })
  })

  it('undo stays admin-only: staff get 403', async () => {
    const res = await call('/undo-money-entry', staff, {
      businessId: 7,
      entryId: 'abc',
      reason: 'Typo',
    })
    expect(res).toMatchObject({ status: 403, body: { code: 'not-admin' } })
  })

  it('extend-deadline passes which, days and reason', async () => {
    const res = await call('/extend-deadline', staff, {
      businessId: 7,
      which: 'downpayment',
      days: 3,
      reason: 'Travelling',
    })
    expect(res.status).toBe(200)
  })
})
