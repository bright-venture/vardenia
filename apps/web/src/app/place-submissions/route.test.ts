import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('../../payload.config', () => ({ default: {} }))
vi.mock('../../lib/rate-limit', () => ({
  withRateLimit: (handler: (request: Request) => Promise<Response>) => handler,
}))
vi.mock('../../lib/scan-guard', () => ({ clientIp: () => '203.0.113.9' }))
vi.mock('../../lib/turnstile', () => ({ verifyTurnstile: vi.fn() }))
vi.mock('../../lib/place-submission', () => ({ startPlaceSubmission: vi.fn() }))

const { POST } = await import('./route')
const { verifyTurnstile } = await import('../../lib/turnstile')
const { startPlaceSubmission } = await import('../../lib/place-submission')

const DATA = {
  name: 'Cafe Cedar',
  kind: 'cafes',
  governorate: 'beirut',
  city: 'beirut',
  address: 'Hamra',
  ownerName: 'Sami',
  ownerEmail: 'sami@example.com',
  ownerPhone: '70123456',
  pageTemplate: 'a',
  layout: 'full-page',
  issue: 1,
  listingNumber: 5,
  locale: 'en',
}

const post = async (body: unknown, type = 'application/json') => {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const response = await (POST as unknown as (request: Request) => Promise<Response>)(
    new Request('http://x/place-submissions', {
      method: 'POST',
      headers: { 'content-type': type, 'content-length': String(text.length) },
      body: text,
    }),
  )
  return {
    status: response.status,
    cache: response.headers.get('cache-control'),
    body: (await response.json()) as Record<string, unknown>,
  }
}

beforeEach(() => {
  vi.mocked(verifyTurnstile).mockReset().mockResolvedValue({ ok: true, skipped: true })
  vi.mocked(startPlaceSubmission).mockReset()
})

describe('POST /place-submissions', () => {
  it('refuses a failed Turnstile check with 403, before any write', async () => {
    vi.mocked(verifyTurnstile).mockResolvedValue({ ok: false, reason: 'missing-token' })
    const r = await post({ data: DATA })
    expect(r.status).toBe(403)
    expect(r.body).toMatchObject({ ok: false, code: 'missing-token' })
    expect(startPlaceSubmission).not.toHaveBeenCalled()
  })

  it('reads the token from the JSON body', async () => {
    vi.mocked(startPlaceSubmission).mockResolvedValue({
      ok: false,
      code: 'error',
      message: 'x',
    })
    await post({ data: DATA, turnstileToken: 'tok' })
    expect(verifyTurnstile).toHaveBeenCalledWith('tok', '203.0.113.9')
  })

  it('refuses a non-JSON body with 415', async () => {
    const r = await post('x', 'multipart/form-data; boundary=a')
    expect(r.status).toBe(415)
    expect(startPlaceSubmission).not.toHaveBeenCalled()
  })

  it('400s with field errors for invalid data, and for an unknown kind', async () => {
    const bad = await post({ data: { ...DATA, name: '' } })
    expect(bad.status).toBe(400)
    expect(bad.body.errors).toHaveProperty('name')
    const hidden = await post({ data: { ...DATA, kind: 'spaceport' } })
    expect(hidden.status).toBe(400)
    expect(hidden.body.errors).toHaveProperty('kind')
    expect(startPlaceSubmission).not.toHaveBeenCalled()
  })

  it.each([
    ['number-unavailable', 409],
    ['layout-unavailable', 409],
    ['no-range', 422],
    ['kind-unavailable', 400],
    ['error', 500],
  ] as const)('maps %s to %i', async (code, status) => {
    vi.mocked(startPlaceSubmission).mockResolvedValue({ ok: false, code, message: 'm' })
    const r = await post({ data: DATA })
    expect(r.status).toBe(status)
    expect(r.body).toEqual({ ok: false, code, message: 'm' })
    expect(r.cache).toBe('no-store')
  })

  it('builds the upload link in the language the form was sent in', async () => {
    vi.mocked(startPlaceSubmission).mockResolvedValue({
      ok: true,
      listingId: 1,
      reference: 'VD-1',
      sessionToken: 'tok',
      expiresAt: '2026-11-23T10:30:00.000Z',
      price: 500,
      downpaymentAmount: 250,
      currency: 'USD',
    })
    const r = await post({ data: { ...DATA, locale: 'ar' }, turnstileToken: 't' })
    expect((r.body as { uploadUrl: string }).uploadUrl).toBe(
      'http://localhost:3000/ar/magazine-places/upload#t=tok',
    )
  })

  it('answers 201 with the reference, token, expiry, price and the QR upload link only', async () => {
    vi.mocked(startPlaceSubmission).mockResolvedValue({
      ok: true,
      listingId: 424242,
      reference: 'VD-987',
      sessionToken: 'secret-token',
      expiresAt: '2026-11-23T10:30:00.000Z',
      price: 500,
      downpaymentAmount: 250,
      currency: 'USD',
    })
    const r = await post({ data: DATA, turnstileToken: 't' })
    expect(r.status).toBe(201)
    expect(r.cache).toBe('no-store')
    expect(r.body).toEqual({
      ok: true,
      reference: 'VD-987',
      sessionToken: 'secret-token',
      expiresAt: '2026-11-23T10:30:00.000Z',
      price: 500,
      downpaymentAmount: 250,
      currency: 'USD',
      uploadUrl: 'http://localhost:3000/en/magazine-places/upload#t=secret-token',
    })
    // The token rides in the fragment, never in a query string.
    expect(new URL((r.body as { uploadUrl: string }).uploadUrl).search).toBe('')
    // No listing id and no owner details reach the browser.
    const text = JSON.stringify(r.body)
    expect(r.body).not.toHaveProperty('listingId')
    expect(text).not.toContain('424242')
    expect(text).not.toContain('sami@example.com')
    expect(text).not.toContain('70123456')
    expect(startPlaceSubmission).toHaveBeenCalledTimes(1)
  })
})
