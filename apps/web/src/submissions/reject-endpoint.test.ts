import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakePayload, type FakePayload } from '../lib/place-submission-fake'

vi.mock('../lib/report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('../lib/auth-email', () => ({ siteOrigin: () => 'https://vardenia.example' }))

const { rejectSubmissionEndpoint } = await import('./reject-endpoint')

let f: FakePayload

const call = async (user: unknown, body: unknown) => {
  const res = (await rejectSubmissionEndpoint.handler({
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
        submission: { status: 'pending', reference: 'VD-7', ownerEmail: 'o@e.com', ownerName: 'O' },
      },
    ],
  })
})

describe('POST /api/reject-submission', () => {
  it('is a POST at /reject-submission', () => {
    expect(rejectSubmissionEndpoint.method).toBe('post')
    expect(rejectSubmissionEndpoint.path).toBe('/reject-submission')
  })

  it.each([
    ['anonymous', null],
    ['a partner', { id: 9, collection: 'business-users' }],
    ['a customer', { id: 4, collection: 'customers' }],
  ])('%s gets 403 and nothing happens', async (_l, user) => {
    const res = await call(user, { businessId: 7, reason: 'No' })
    expect(res.status).toBe(403)
    expect(f.updates).toHaveLength(0)
    expect(f.emails).toHaveLength(0)
    expect(f.row('businesses').submission).toMatchObject({ status: 'pending' })
  })

  it('staff reject with a reason', async () => {
    const res = await call(
      { id: 2, collection: 'users', roles: ['staff'] },
      { businessId: 7, reason: 'Outside Lebanon', shareReason: true },
    )
    expect(res).toMatchObject({ status: 200, body: { ok: true, emailed: true } })
    expect(f.row('businesses').submission).toMatchObject({ status: 'rejected' })
  })

  it('answers a missing reason with 400 and a plain message', async () => {
    const res = await call({ id: 2, collection: 'users', roles: ['staff'] }, { businessId: 7 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/reason/)
  })

  it('answers a body that is not JSON with 400', async () => {
    const res = (await rejectSubmissionEndpoint.handler({
      payload: f.payload,
      user: { id: 2, collection: 'users', roles: ['staff'] },
      json: async () => {
        throw new Error('bad json')
      },
    } as never)) as Response
    expect(res.status).toBe(400)
  })

  it('answers a state that cannot be rejected with 409', async () => {
    f.row('businesses').submission = { status: 'approved' }
    const res = await call(
      { id: 2, collection: 'users', roles: ['admin'] },
      { businessId: 7, reason: 'x' },
    )
    expect(res.status).toBe(409)
  })
})
