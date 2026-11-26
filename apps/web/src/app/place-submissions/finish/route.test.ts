import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('../../../payload.config', () => ({ default: {} }))
vi.mock('../../../lib/rate-limit', () => ({
  withRateLimit: (handler: (request: Request) => Promise<Response>) => handler,
}))
vi.mock('../../../lib/scan-guard', () => ({ clientIp: () => '203.0.113.9' }))
vi.mock('../../../lib/turnstile', () => ({ verifyTurnstile: vi.fn() }))
vi.mock('../../../lib/place-submission-finish', () => ({ finishPlaceSubmission: vi.fn() }))

const { POST } = await import('./route')
const { verifyTurnstile } = await import('../../../lib/turnstile')
const { finishPlaceSubmission } = await import('../../../lib/place-submission-finish')

const post = async (body: unknown, type = 'application/json') => {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const response = await (POST as unknown as (request: Request) => Promise<Response>)(
    new Request('http://x/place-submissions/finish', {
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
  vi.mocked(finishPlaceSubmission).mockReset()
})

describe('POST /place-submissions/finish', () => {
  it('returns the reference, no-store', async () => {
    vi.mocked(finishPlaceSubmission).mockResolvedValue({ ok: true, reference: 'VD-5' })
    const r = await post({ sessionToken: 't', acceptedTerms: true, extra: 'ignored' })
    expect(r).toMatchObject({
      status: 200,
      cache: 'no-store',
      body: { ok: true, reference: 'VD-5' },
    })
    expect(finishPlaceSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ token: 't', acceptedTerms: true, locale: 'en' }),
    )
  })

  it('a replay of a finish that already worked is a plain 200 with the same reference', async () => {
    vi.mocked(finishPlaceSubmission).mockResolvedValue({ ok: true, reference: 'VD-5' })
    const first = await post({ sessionToken: 't', acceptedTerms: true })
    const again = await post({ sessionToken: 't', acceptedTerms: true })
    expect(again.status).toBe(200)
    expect(again.body).toEqual(first.body)
  })

  it('passes only the token, the boolean and a language to the service', async () => {
    vi.mocked(finishPlaceSubmission).mockResolvedValue({ ok: true, reference: 'VD-5' })
    await post({
      sessionToken: 't',
      acceptedTerms: true,
      locale: 'ar',
      tier: 'gold',
      status: 'accepted',
    })
    const args = vi.mocked(finishPlaceSubmission).mock.calls[0]![0]
    expect(Object.keys(args).sort()).toEqual(['acceptedTerms', 'locale', 'payload', 'token'])
    expect(args.locale).toBe('ar')
  })

  it('refuses a failed Turnstile check with 403 before anything else', async () => {
    vi.mocked(verifyTurnstile).mockResolvedValue({ ok: false, reason: 'missing-token' })
    const r = await post({ sessionToken: 't', acceptedTerms: true })
    expect(r.status).toBe(403)
    expect(finishPlaceSubmission).not.toHaveBeenCalled()
  })

  it('400s when the token or the boolean is missing or the wrong type', async () => {
    for (const body of [
      {},
      { sessionToken: 't' },
      { sessionToken: 't', acceptedTerms: 'yes' },
      { sessionToken: 5, acceptedTerms: true },
    ]) {
      expect((await post(body)).status).toBe(400)
    }
    expect(finishPlaceSubmission).not.toHaveBeenCalled()
  })

  it('415s a non-JSON body', async () => {
    expect((await post('x', 'text/plain')).status).toBe(415)
  })

  it('maps outcomes to statuses in the same error style', async () => {
    const cases = [
      ['not-found', 404],
      ['terms-not-accepted', 422],
      ['photos-missing', 422],
      ['error', 500],
    ] as const
    for (const [code, status] of cases) {
      vi.mocked(finishPlaceSubmission).mockResolvedValue({ ok: false, code })
      const r = await post({ sessionToken: 't', acceptedTerms: true })
      expect(r.status).toBe(status)
      expect(r.body).toMatchObject({ ok: false, code })
      expect(typeof r.body.message).toBe('string')
    }
  })
})
