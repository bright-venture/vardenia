import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two sign-in counters (21 November 2026): 10 a minute per connection and
 * email, 60 a minute per connection. The database counter is faked in memory.
 */
const counts = new Map<string, number>()
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('../payload.config', () => ({ default: {} }))
vi.mock('./rate-limit-store', () => ({
  counterKey: (scope: string, value: string) => `${scope}|${value}`,
  bucketKey: (budget: number, ip: string) => `${budget}|${ip}`,
  hit: vi.fn(async (_payload: unknown, key: string, windowMs: number, now: number) => {
    const count = (counts.get(key) ?? 0) + 1
    counts.set(key, count)
    return { count, resetAt: now + windowMs }
  }),
  sweepExpired: vi.fn(async () => {}),
}))

const { RATE_LIMIT, checkRatePerEmail, emailOf, withRateLimit } = await import('./rate-limit')

const signIn = (email: string | null, ip = '203.0.113.7') =>
  new Request('http://localhost:3000/api/customers/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(email === null ? { token: 't' } : { email, password: 'x' }),
  })

const NOW = 1_800_000_000_000
beforeEach(() => counts.clear())

describe('two sign-in counters', () => {
  it('has the agreed numbers', () => {
    expect(RATE_LIMIT.AUTH_PER_WINDOW).toBe(10)
    expect(RATE_LIMIT.AUTH_CONNECTION_PER_WINDOW).toBe(60)
  })

  it('lets 20 people on one connection sign in within a minute', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await checkRatePerEmail(signIn(`guest${i}@example.com`), NOW)).allowed).toBe(true)
    }
  })

  it('stops one email after 10 tries in a minute, without blocking the others', async () => {
    for (let i = 0; i < 10; i++) await checkRatePerEmail(signIn('sara@example.com'), NOW)
    expect((await checkRatePerEmail(signIn('sara@example.com'), NOW)).allowed).toBe(false)
    expect((await checkRatePerEmail(signIn('karim@example.com'), NOW)).allowed).toBe(true)
  })

  it('treats the same email in any case as one person', async () => {
    for (let i = 0; i < 10; i++) await checkRatePerEmail(signIn('Sara@Example.com'), NOW)
    expect((await checkRatePerEmail(signIn('sara@example.com'), NOW)).allowed).toBe(false)
  })

  it('stops one connection spraying many emails after 60 in a minute', async () => {
    for (let i = 0; i < 60; i++) await checkRatePerEmail(signIn(`victim${i}@example.com`), NOW)
    const verdict = await checkRatePerEmail(signIn('another@example.com'), NOW)
    expect(verdict.allowed).toBe(false)
    expect(verdict.limit).toBe(60)
  })

  it('counts each connection on its own', async () => {
    for (let i = 0; i < 10; i++)
      await checkRatePerEmail(signIn('sara@example.com', '198.51.100.1'), NOW)
    expect((await checkRatePerEmail(signIn('sara@example.com', '198.51.100.2'), NOW)).allowed).toBe(
      true,
    )
  })

  it('gives requests with no email one shared counter of 10, as before', async () => {
    for (let i = 0; i < 10; i++) await checkRatePerEmail(signIn(null), NOW)
    expect((await checkRatePerEmail(signIn(null), NOW)).allowed).toBe(false)
  })
})

describe('reading the email', () => {
  it('reads it from a JSON body and leaves the body for the handler', async () => {
    const handler = vi.fn(async (request: Request) => Response.json(await request.json()))
    const wrapped = withRateLimit(handler as never, RATE_LIMIT.AUTH_PER_WINDOW, { perEmail: true })
    const res = await wrapped(signIn('sara@example.com'), {} as never)
    expect(await res.json()).toEqual({ email: 'sara@example.com', password: 'x' })
  })

  it('finds no email in a GET or a non-JSON body', async () => {
    expect(await emailOf(new Request('http://localhost:3000/api/customers/me'))).toBe('')
    const form = new Request('http://localhost:3000/x', { method: 'POST', body: 'email=a@b.co' })
    expect(await emailOf(form)).toBe('')
  })

  it('answers "Too many requests" once over', async () => {
    const wrapped = withRateLimit(async () => new Response('ok'), RATE_LIMIT.AUTH_PER_WINDOW, {
      perEmail: true,
    })
    for (let i = 0; i < 10; i++) await wrapped(signIn('sara@example.com'), {} as never)
    expect((await wrapped(signIn('sara@example.com'), {} as never)).status).toBe(429)
  })
})
