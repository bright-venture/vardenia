import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.fn()
const sendEmail = vi.fn(async () => ({}))
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ auth, sendEmail })) }))
vi.mock('../../../payload.config', () => ({ default: {} }))
const limits: unknown[][] = []
vi.mock('../../../lib/rate-limit', () => ({
  withRateLimit: (handler: unknown, ...rest: unknown[]) => {
    limits.push(rest)
    return handler
  },
}))
vi.mock('../../../lib/report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('../../../lib/branches', () => ({ createBranch: vi.fn() }))

const { POST } = await import('./route')
const { createBranch } = await import('../../../lib/branches')

const partner = {
  id: 3,
  collection: 'business-users',
  email: 'owner@example.com',
  name: 'Rita',
  phone: '+96170000000',
  businesses: [10, { id: 11 }],
}

const body = {
  sourceListingId: 10,
  name: 'Cafe Nour Jounieh',
  governorate: 'keserwan',
  city: 'jounieh',
  address: 'Main road, Jounieh',
  mapUrl: 'https://www.google.com/maps/@33.98,35.61,17z',
}

const post = async (
  payloadBody: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> => {
  const request = new Request('http://vardenia.test/partner-data/branches', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof payloadBody === 'string' ? payloadBody : JSON.stringify(payloadBody),
  })
  const response = await (POST as unknown as (r: Request) => Promise<Response>)(request)
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe('POST /partner-data/branches', () => {
  beforeEach(() => {
    auth.mockReset()
    sendEmail.mockClear()
    vi.mocked(createBranch).mockReset()
    vi.mocked(createBranch).mockResolvedValue({
      ok: true,
      listingId: 77,
      brandId: 5,
      brandCreated: true,
      brandName: 'Cafe Nour',
      sourceName: 'Cafe Nour',
    })
    process.env.PLACE_SUBMISSION_ALERT_TO = 'team@vardenia.example'
  })

  it('is rate limited, counted across instances', () => {
    expect(limits).toHaveLength(1)
    expect(limits[0]![1]).toEqual({ shared: true })
  })

  it('refuses an anonymous caller with 401', async () => {
    auth.mockResolvedValue({ user: null })
    expect((await post(body)).status).toBe(401)
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('refuses a broken session like an anonymous one', async () => {
    auth.mockRejectedValue(new Error('bad token'))
    expect((await post(body)).status).toBe(401)
  })

  it.each([
    ['a customer', { id: 3, collection: 'customers', businesses: [10] }],
    ['staff', { id: 3, collection: 'users', roles: ['admin'], businesses: [10] }],
  ])('refuses %s with 403', async (_label, user) => {
    auth.mockResolvedValue({ user })
    expect((await post(body)).status).toBe(403)
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('refuses a cross-site request', async () => {
    auth.mockResolvedValue({ user: partner })
    expect((await post(body, { origin: 'https://evil.example' })).status).toBe(403)
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('wants JSON', async () => {
    auth.mockResolvedValue({ user: partner })
    expect((await post(body, { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await post('not json')).status).toBe(400)
  })

  it('refuses an oversized body', async () => {
    auth.mockResolvedValue({ user: partner })
    expect((await post(body, { 'content-length': String(64 * 1024) })).status).toBe(413)
  })

  it('refuses a body with a staff-only key, naming it', async () => {
    auth.mockResolvedValue({ user: partner })
    const result = await post({ ...body, tier: 'platinum' })
    expect(result.status).toBe(400)
    expect(JSON.stringify(result.body)).toContain('tier')
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('refuses a point or a map link outside Lebanon (the one rule)', async () => {
    auth.mockResolvedValue({ user: partner })
    for (const over of [
      { mapUrl: undefined, location: [2.35, 48.85] },
      { mapUrl: undefined, location: [33.98, 35.61] },
      { mapUrl: 'https://www.google.com/maps/@48.85,2.35,15z' },
    ]) {
      const result = await post({ ...body, ...over })
      expect(result.status, JSON.stringify(over)).toBe(400)
    }
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('refuses a city of another governorate', async () => {
    auth.mockResolvedValue({ user: partner })
    const result = await post({ ...body, governorate: 'beirut' })
    expect(result.status).toBe(400)
    expect(JSON.stringify(result.body)).toContain('city')
  })

  it('answers 404 for a listing the partner does not own, without asking the service', async () => {
    auth.mockResolvedValue({ user: partner })
    const result = await post({ ...body, sourceListingId: 40 })
    expect(result.status).toBe(404)
    expect(createBranch).not.toHaveBeenCalled()
  })

  it('creates the branch for the signed-in partner and tells the team and the partner', async () => {
    auth.mockResolvedValue({ user: partner })
    const result = await post({ ...body, sourceListingId: 11, locale: 'ar' })
    expect(result.status).toBe(201)
    expect(result.body).toEqual({ ok: true, listingId: 77, brandId: 5 })
    expect(vi.mocked(createBranch).mock.calls[0]![0]).toMatchObject({
      partner: { id: 3, email: 'owner@example.com', name: 'Rita', phone: '+96170000000' },
      input: { sourceListingId: 11, name: 'Cafe Nour Jounieh' },
    })
    const to = sendEmail.mock.calls.map((c) => (c as unknown as [{ to: string }])[0].to)
    expect(to).toEqual(['team@vardenia.example', 'owner@example.com'])
    const partnerMail = (sendEmail.mock.calls[1] as unknown as [{ html: string }])[0]
    expect(partnerMail.html).toContain('dir="rtl"')
  })

  it('still answers 201 when the emails fail', async () => {
    auth.mockResolvedValue({ user: partner })
    sendEmail.mockRejectedValue(new Error('smtp down'))
    expect((await post(body)).status).toBe(201)
  })

  it.each([
    ['not-restaurant', 400],
    ['brand-full', 409],
    ['daily-limit', 429],
    ['not-found', 404],
    ['error', 500],
  ] as const)('passes on a %s refusal as %d', async (code, status) => {
    auth.mockResolvedValue({ user: partner })
    vi.mocked(createBranch).mockResolvedValue({ ok: false, code, status, message: 'no' })
    const result = await post(body)
    expect(result.status).toBe(status)
    expect(result.body).toMatchObject({ ok: false, code })
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
