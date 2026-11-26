import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('../../../payload.config', () => ({ default: {} }))
const wrapped = vi.hoisted(() => ({ options: undefined as unknown }))
vi.mock('../../../lib/rate-limit', () => ({
  withRateLimit: (handler: unknown, _budget: unknown, options: unknown) => {
    wrapped.options = options
    return handler
  },
  checkRatePerKey: vi.fn(),
  tooManyRequests: () => new Response('slow down', { status: 429 }),
}))
vi.mock('../../../lib/place-upload', () => ({ placeSessionStatus: vi.fn() }))

const { POST, STATUS_PER_SESSION_PER_MINUTE, STATUS_PER_CONNECTION_PER_MINUTE } =
  await import('./route')
const { checkRatePerKey } = await import('../../../lib/rate-limit')
const { placeSessionStatus } = await import('../../../lib/place-upload')
const { hashSessionToken } = await import('../../../lib/place-submission')

const post = async (body: unknown, url = 'http://x/place-submissions/status') => {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const response = await (POST as unknown as (request: Request) => Promise<Response>)(
    new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(text.length) },
      body: text,
    }),
  )
  return {
    status: response.status,
    cache: response.headers.get('cache-control'),
    body: (await response.json().catch(() => null)) as Record<string, unknown>,
  }
}

beforeEach(() => {
  vi.mocked(placeSessionStatus).mockReset()
  vi.mocked(checkRatePerKey)
    .mockReset()
    .mockResolvedValue({ allowed: true, limit: 60, remaining: 59, retryAfter: 0 })
})

describe('POST /place-submissions/status', () => {
  it('answers the flags and live, no-store, and nothing else', async () => {
    vi.mocked(placeSessionStatus).mockResolvedValue({
      ok: true,
      logoReceived: true,
      heroReceived: false,
      live: true,
    })
    expect(await post({ sessionToken: 'tok' })).toEqual({
      status: 200,
      cache: 'no-store',
      body: { ok: true, logoReceived: true, heroReceived: false, live: true },
    })
    expect(placeSessionStatus).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok' }))
  })

  it('a plain 404 for any bad token, no-store', async () => {
    vi.mocked(placeSessionStatus).mockResolvedValue({ ok: false, code: 'not-found' })
    const r = await post({ sessionToken: 'tok' })
    expect(r.status).toBe(404)
    expect(r.cache).toBe('no-store')
  })

  it('400 for a missing, empty, non-string or oversized token; 415 for non-JSON', async () => {
    for (const body of [
      {},
      { sessionToken: '' },
      { sessionToken: 5 },
      { sessionToken: 'x'.repeat(300) },
    ]) {
      expect((await post(body)).status).toBe(400)
    }
    const response = await (POST as unknown as (r: Request) => Promise<Response>)(
      new Request('http://x/place-submissions/status', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'content-length': '1' },
        body: 'x',
      }),
    )
    expect(response.status).toBe(415)
    expect(placeSessionStatus).not.toHaveBeenCalled()
  })

  it('never reads the token from the query string', async () => {
    const r = await post({}, 'http://x/place-submissions/status?sessionToken=tok')
    expect(r.status).toBe(400)
    expect(placeSessionStatus).not.toHaveBeenCalled()
  })

  it('has room for one poll every 2 seconds on its own counters, per token and per connection', async () => {
    expect(STATUS_PER_SESSION_PER_MINUTE).toBeGreaterThanOrEqual(30)
    expect(STATUS_PER_CONNECTION_PER_MINUTE).toBeGreaterThanOrEqual(30)
    expect(wrapped.options).toEqual({
      action: 'place-status',
      perMinute: STATUS_PER_CONNECTION_PER_MINUTE,
    })
    vi.mocked(placeSessionStatus).mockResolvedValue({ ok: false, code: 'not-found' })
    await post({ sessionToken: 'tok' })
    expect(checkRatePerKey).toHaveBeenCalledWith(
      'place-status',
      hashSessionToken('tok'),
      STATUS_PER_SESSION_PER_MINUTE,
    )
  })

  it('429 when the session is over its counter', async () => {
    vi.mocked(checkRatePerKey).mockResolvedValue({
      allowed: false,
      limit: 60,
      remaining: 0,
      retryAfter: 9,
    })
    expect((await post({ sessionToken: 'tok' })).status).toBe(429)
    expect(placeSessionStatus).not.toHaveBeenCalled()
  })
})
