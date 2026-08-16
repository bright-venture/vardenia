import { beforeEach, describe, expect, it } from 'vitest'
import { RATE_LIMIT, __resetRateLimit, checkRate, withRateLimit } from './rate-limit'

/**
 * The companion to api-limits. That bounds one request; this bounds how many.
 *
 * The interesting cases are the ones where a rate limiter becomes the problem:
 * blocking real staff, or letting one caller deny service to everyone else by
 * sharing a bucket.
 */

const from = (ip: string | null, extra: Record<string, string> = {}) =>
  new Headers(ip ? { 'x-real-ip': ip, ...extra } : extra)

beforeEach(() => {
  __resetRateLimit()
})

describe('checkRate', () => {
  it('allows an ordinary caller', () => {
    const verdict = checkRate(from('1.1.1.1'))

    expect(verdict.allowed).toBe(true)
    expect(verdict.limit).toBe(RATE_LIMIT.MAX_PER_WINDOW)
    expect(verdict.remaining).toBe(RATE_LIMIT.MAX_PER_WINDOW - 1)
  })

  it('allows exactly the budget, then blocks', () => {
    const now = Date.now()
    for (let i = 0; i < RATE_LIMIT.MAX_PER_WINDOW; i++) {
      expect(checkRate(from('1.1.1.1'), now).allowed, `blocked at request ${i + 1}`).toBe(true)
    }

    expect(checkRate(from('1.1.1.1'), now).allowed).toBe(false)
  })

  it('counts each address separately, so one scraper does not block everyone', () => {
    const now = Date.now()
    for (let i = 0; i < RATE_LIMIT.MAX_PER_WINDOW + 10; i++) checkRate(from('1.1.1.1'), now)

    expect(checkRate(from('1.1.1.1'), now).allowed).toBe(false)
    expect(checkRate(from('2.2.2.2'), now).allowed).toBe(true)
  })

  it('forgives the caller once the window passes', () => {
    const now = Date.now()
    for (let i = 0; i < RATE_LIMIT.MAX_PER_WINDOW + 5; i++) checkRate(from('1.1.1.1'), now)
    expect(checkRate(from('1.1.1.1'), now).allowed).toBe(false)

    const later = now + RATE_LIMIT.WINDOW_MS + 1
    expect(checkRate(from('1.1.1.1'), later).allowed).toBe(true)
  })

  /**
   * The case where the mitigation would become the vulnerability. If every
   * caller we cannot identify shared one bucket, a single script could exhaust
   * it and lock out everyone else behind the same gap in proxy headers.
   */
  it('never blocks a caller it cannot identify', () => {
    const now = Date.now()
    for (let i = 0; i < RATE_LIMIT.MAX_PER_WINDOW * 3; i++) {
      expect(checkRate(from(null), now).allowed).toBe(true)
    }
  })

  it('reports a retry-after inside the window', () => {
    const now = Date.now()
    for (let i = 0; i < RATE_LIMIT.MAX_PER_WINDOW + 1; i++) checkRate(from('1.1.1.1'), now)

    const verdict = checkRate(from('1.1.1.1'), now)
    expect(verdict.retryAfter).toBeGreaterThan(0)
    expect(verdict.retryAfter).toBeLessThanOrEqual(RATE_LIMIT.WINDOW_MS / 1000)
  })

  it('never reports negative remaining', () => {
    const now = Date.now()
    for (let i = 0; i < RATE_LIMIT.MAX_PER_WINDOW * 2; i++) checkRate(from('1.1.1.1'), now)

    expect(checkRate(from('1.1.1.1'), now).remaining).toBe(0)
  })

  /**
   * Reuses scan-guard's resolver, which prefers the platform header and then
   * the rightmost forwarded hop - the one nearest our own proxy, and the only
   * one a caller cannot invent.
   */
  it('prefers the platform header over a forwarded chain the caller controls', () => {
    const now = Date.now()
    const headers = new Headers({
      'cf-connecting-ip': '9.9.9.9',
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
    })

    for (let i = 0; i < RATE_LIMIT.MAX_PER_WINDOW; i++) checkRate(headers, now)

    // Blocked under the real address, not under the invented one.
    expect(checkRate(headers, now).allowed).toBe(false)
    expect(checkRate(from('1.2.3.4'), now).allowed).toBe(true)
  })
})

describe('withRateLimit', () => {
  const ok = async () => new Response('ok')

  it('passes a normal request through', async () => {
    const wrapped = withRateLimit(ok as never)
    const res = await wrapped(new Request('http://x/api/businesses'), undefined as never)

    expect(res.status).toBe(200)
  })

  it('advertises the budget on every response, so a client can back off early', async () => {
    const wrapped = withRateLimit(ok as never)
    const res = await wrapped(
      new Request('http://x/api/businesses', { headers: { 'x-real-ip': '1.1.1.1' } }),
      undefined as never,
    )

    expect(res.headers.get('x-ratelimit-limit')).toBe(String(RATE_LIMIT.MAX_PER_WINDOW))
    expect(Number(res.headers.get('x-ratelimit-remaining'))).toBeGreaterThanOrEqual(0)
  })

  it('answers 429 with Retry-After once the budget is gone', async () => {
    const wrapped = withRateLimit(ok as never)
    const request = () =>
      wrapped(
        new Request('http://x/api/businesses', { headers: { 'x-real-ip': '3.3.3.3' } }),
        undefined as never,
      )

    for (let i = 0; i < RATE_LIMIT.MAX_PER_WINDOW; i++) await request()

    const blocked = await request()
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('stops calling the handler once blocked, which is the whole point', async () => {
    let calls = 0
    const counted = async () => {
      calls++
      return new Response('ok')
    }

    const wrapped = withRateLimit(counted as never)
    for (let i = 0; i < RATE_LIMIT.MAX_PER_WINDOW + 50; i++) {
      await wrapped(
        new Request('http://x/api/businesses', { headers: { 'x-real-ip': '4.4.4.4' } }),
        undefined as never,
      )
    }

    expect(calls).toBe(RATE_LIMIT.MAX_PER_WINDOW)
  })
})
