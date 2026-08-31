import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isTurnstileConfigured, verifyTurnstile } from './turnstile'

vi.mock('./report', () => ({ reportError: vi.fn() }))

/**
 * The check in front of sign-up.
 *
 * The property that decides whether this is safe to merge is the unconfigured
 * one: today no secret is set, so if this refused anything it would break
 * sign-up on the next deploy for want of an environment variable. That is a
 * worse failure than the abuse it prevents, so it is tested first and hardest.
 */

const SECRET = 'test-secret'
const ok = (success: boolean) =>
  ({ ok: true, status: 200, json: async () => ({ success }) }) as unknown as Response

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('when no secret is configured', () => {
  it('is reported as unconfigured', () => {
    expect(isTurnstileConfigured(undefined)).toBe(false)
    expect(isTurnstileConfigured('')).toBe(false)
    expect(isTurnstileConfigured('   ')).toBe(false)
    expect(isTurnstileConfigured(SECRET)).toBe(true)
  })

  it('allows a request with no token at all, and calls nobody', async () => {
    const verdict = await verifyTurnstile(undefined, null, undefined)

    expect(verdict).toEqual({ ok: true, skipped: true })
    expect(fetchMock, 'must not call Cloudflare when unconfigured').not.toHaveBeenCalled()
  })

  /** The exact shape of today's production request, which must keep working. */
  it('allows a real sign-up body that carries no token', async () => {
    expect((await verifyTurnstile(null, '1.2.3.4', '')).ok).toBe(true)
  })
})

describe('when a secret is configured', () => {
  it('accepts a token Cloudflare approves', async () => {
    fetchMock.mockResolvedValue(ok(true))
    expect(await verifyTurnstile('good-token', null, SECRET)).toEqual({ ok: true, skipped: false })
  })

  it('refuses a token Cloudflare rejects', async () => {
    fetchMock.mockResolvedValue(ok(false))
    expect(await verifyTurnstile('bad-token', null, SECRET)).toEqual({
      ok: false,
      reason: 'rejected',
    })
  })

  it.each([undefined, null, '', '   ', 42])('refuses a missing token (%s)', async (token) => {
    expect(await verifyTurnstile(token, null, SECRET)).toEqual({
      ok: false,
      reason: 'missing-token',
    })
    expect(fetchMock, 'no need to ask Cloudflare about nothing').not.toHaveBeenCalled()
  })

  it('sends the secret and the token, and the IP when known', async () => {
    fetchMock.mockResolvedValue(ok(true))
    await verifyTurnstile('t', '9.9.9.9', SECRET)

    const call = fetchMock.mock.calls[0]
    expect(call, 'Cloudflare should have been called').toBeDefined()
    const sent = (call![1] as { body: URLSearchParams }).body
    expect(sent.get('secret')).toBe(SECRET)
    expect(sent.get('response')).toBe('t')
    expect(sent.get('remoteip')).toBe('9.9.9.9')
  })

  it('omits the IP rather than sending an empty one', async () => {
    fetchMock.mockResolvedValue(ok(true))
    await verifyTurnstile('t', null, SECRET)
    const sent = (fetchMock.mock.calls[0]![1] as { body: URLSearchParams }).body
    expect(sent.has('remoteip')).toBe(false)
  })

  /**
   * Cloudflare being down is our problem, not the reader's. Turning their
   * outage into our sign-up outage trades a small risk for a total one, so the
   * failure direction here is deliberate and is the reason this is tested.
   */
  it('allows the request when Cloudflare cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    expect(await verifyTurnstile('t', null, SECRET)).toEqual({ ok: true, skipped: true })
  })

  it('allows the request when Cloudflare answers with an error status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 } as unknown as Response)
    expect(await verifyTurnstile('t', null, SECRET)).toEqual({ ok: true, skipped: true })
  })

  it('allows the request when the response is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)
    expect((await verifyTurnstile('t', null, SECRET)).ok).toBe(true)
  })
})
