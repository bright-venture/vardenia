import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('../../payload.config', () => ({ default: {} }))
const wrapped = vi.hoisted(() => ({ options: undefined as unknown }))
vi.mock('../../lib/rate-limit', () => ({
  withRateLimit: (handler: unknown, _budget: unknown, options: unknown) => {
    wrapped.options = options
    return handler
  },
  checkRatePerKey: vi.fn(),
  rateHeaders: () => ({ 'x-ratelimit-remaining': '5' }),
  tooManyRequests: () => new Response('slow down', { status: 429 }),
}))
vi.mock('../../lib/place-upload', () => ({ attachPlacePhoto: vi.fn() }))

const { POST, UPLOADS_PER_SESSION_PER_MINUTE, UPLOADS_PER_CONNECTION_PER_MINUTE } =
  await import('./route')
const { checkRatePerKey } = await import('../../lib/rate-limit')
const { attachPlacePhoto } = await import('../../lib/place-upload')
const { MAX_UPLOAD_BODY_BYTES } = await import('../../lib/place-upload-request')
const { PHOTO_MAX_BYTES } = await import('../../hooks/limitUploadSize')
const { hashSessionToken } = await import('../../lib/place-submission')

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])

function multipart(fields: Record<string, string | File | undefined>) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) form.set(key, value)
  return form
}

/** A real multipart body, with the length a browser would send. */
async function send(
  form: FormData,
  over: { url?: string; headers?: Record<string, string>; length?: string | null } = {},
) {
  const probe = new Response(form)
  const type = probe.headers.get('content-type')!
  const bytes = new Uint8Array(await probe.arrayBuffer())
  const headers: Record<string, string> = { 'content-type': type, ...over.headers }
  if (over.length !== null) headers['content-length'] = over.length ?? String(bytes.length)
  const response = await (POST as unknown as (request: Request) => Promise<Response>)(
    new Request(over.url ?? 'http://x/place-uploads', { method: 'POST', headers, body: bytes }),
  )
  return {
    status: response.status,
    cache: response.headers.get('cache-control'),
    body: (await response.json().catch(() => null)) as Record<string, unknown> | null,
  }
}

const photo = () => new File([PNG], 'logo.png', { type: 'image/png' })
const good = () => multipart({ sessionToken: 'tok', slot: 'logo', photo: photo() })

beforeEach(() => {
  vi.mocked(attachPlacePhoto).mockReset()
  vi.mocked(checkRatePerKey)
    .mockReset()
    .mockResolvedValue({ allowed: true, limit: 12, remaining: 11, retryAfter: 0 })
})

describe('POST /place-uploads', () => {
  it('answers 200 with the slot and both flags, no-store', async () => {
    vi.mocked(attachPlacePhoto).mockResolvedValue({
      ok: true,
      slot: 'logo',
      logoReceived: true,
      heroReceived: false,
    })
    const r = await send(good())
    expect(r).toEqual({
      status: 200,
      cache: 'no-store',
      body: { ok: true, slot: 'logo', logoReceived: true, heroReceived: false },
    })
    const call = vi.mocked(attachPlacePhoto).mock.calls[0]![0]
    expect(call.token).toBe('tok')
    expect(call.slot).toBe('logo')
    expect(call.file).toBeInstanceOf(File)
    expect(call.file?.size).toBe(PNG.length)
  })

  it('has no Turnstile: the token is the permission', async () => {
    // Nothing to mock: the route imports no verifyTurnstile at all.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./route.ts', import.meta.url), 'utf8'),
    )
    expect(source).not.toMatch(/verifyTurnstile/)
  })

  it.each([
    ['not-found', 404],
    ['error', 500],
  ] as const)('maps %s to %i without leaking why', async (code, status) => {
    vi.mocked(attachPlacePhoto).mockResolvedValue({ ok: false, code })
    const r = await send(good())
    expect(r.status).toBe(status)
    expect(r.cache).toBe('no-store')
  })

  it('every bad token reason is the same 404 body', async () => {
    vi.mocked(attachPlacePhoto).mockResolvedValue({ ok: false, code: 'not-found' })
    const a = await send(good())
    const b = await send(multipart({ sessionToken: 'other', slot: 'hero', photo: photo() }))
    expect(a).toEqual(b)
  })

  it.each([
    ['too-large', 413],
    ['bad-type', 415],
    ['bad-file', 400],
  ] as const)('maps a %s file to %i with its message', async (code, status) => {
    vi.mocked(attachPlacePhoto).mockResolvedValue({ ok: false, code, message: 'nope' })
    const r = await send(good())
    expect(r.status).toBe(status)
    expect(r.body).toEqual({ ok: false, code, message: 'nope' })
  })

  describe('the token is never read from the URL', () => {
    it('a token in the query string alone is refused (400), the service is not called', async () => {
      const r = await send(multipart({ slot: 'logo', photo: photo() }), {
        url: 'http://x/place-uploads?sessionToken=tok',
      })
      expect(r.status).toBe(400)
      expect(attachPlacePhoto).not.toHaveBeenCalled()
    })
    it('a query token is ignored when the body has another', async () => {
      vi.mocked(attachPlacePhoto).mockResolvedValue({ ok: false, code: 'not-found' })
      await send(good(), { url: 'http://x/place-uploads?sessionToken=evil' })
      expect(vi.mocked(attachPlacePhoto).mock.calls[0]![0].token).toBe('tok')
    })
  })

  describe('bad input', () => {
    it('415 when it is not multipart', async () => {
      const response = await (POST as unknown as (r: Request) => Promise<Response>)(
        new Request('http://x/place-uploads', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': '2' },
          body: '{}',
        }),
      )
      expect(response.status).toBe(415)
    })
    it('411 when the size is not stated', async () => {
      expect((await send(good(), { length: null })).status).toBe(411)
      expect((await send(good(), { length: 'abc' })).status).toBe(411)
    })
    it('413 when the stated size is over the cap, before anything is read', async () => {
      const r = await send(good(), { length: String(MAX_UPLOAD_BODY_BYTES + 1) })
      expect(r.status).toBe(413)
      expect(attachPlacePhoto).not.toHaveBeenCalled()
    })
    it('413 when the real body is over the cap although the header lied', async () => {
      const big = new File([new Uint8Array(MAX_UPLOAD_BODY_BYTES + 10)], 'big.png', {
        type: 'image/png',
      })
      const r = await send(multipart({ sessionToken: 'tok', slot: 'logo', photo: big }), {
        length: '1000',
      })
      expect(r.status).toBe(413)
      expect(attachPlacePhoto).not.toHaveBeenCalled()
    })
    it('the cap is the photo limit plus a small margin', () => {
      expect(MAX_UPLOAD_BODY_BYTES).toBeGreaterThan(PHOTO_MAX_BYTES)
      expect(MAX_UPLOAD_BODY_BYTES).toBeLessThan(PHOTO_MAX_BYTES + 1024 * 1024)
    })
    it.each([
      ['no token', { slot: 'logo' as const }],
      ['empty token', { sessionToken: '', slot: 'logo' as const }],
      ['no slot', { sessionToken: 'tok' }],
      ['bad slot', { sessionToken: 'tok', slot: 'gallery' }],
    ])('400 for %s', async (_n, fields) => {
      const r = await send(multipart({ ...fields, photo: photo() } as never))
      expect(r.status).toBe(400)
      expect(attachPlacePhoto).not.toHaveBeenCalled()
    })
    it('400 when photo is text, not a file; a missing file reaches the service (bad-file)', async () => {
      expect(
        (await send(multipart({ sessionToken: 'tok', slot: 'logo', photo: 'text' }))).status,
      ).toBe(400)
      vi.mocked(attachPlacePhoto).mockResolvedValue({ ok: false, code: 'bad-file', message: 'm' })
      expect((await send(multipart({ sessionToken: 'tok', slot: 'logo' }))).status).toBe(400)
      expect(vi.mocked(attachPlacePhoto).mock.calls[0]![0].file).toBeUndefined()
    })
  })

  describe('limits', () => {
    it('counts per session token (hashed) and answers 429 when over', async () => {
      vi.mocked(checkRatePerKey).mockResolvedValue({
        allowed: false,
        limit: 12,
        remaining: 0,
        retryAfter: 30,
      })
      const r = await send(good())
      expect(r.status).toBe(429)
      expect(attachPlacePhoto).not.toHaveBeenCalled()
      expect(checkRatePerKey).toHaveBeenCalledWith(
        'place-upload',
        hashSessionToken('tok'),
        UPLOADS_PER_SESSION_PER_MINUTE,
      )
      // The plain token is never the counter key.
      expect(vi.mocked(checkRatePerKey).mock.calls[0]![1]).not.toBe('tok')
    })
    it('is wrapped with its own per-connection action', () => {
      expect(wrapped.options).toEqual({
        action: 'place-upload',
        perMinute: UPLOADS_PER_CONNECTION_PER_MINUTE,
      })
    })
  })
})
