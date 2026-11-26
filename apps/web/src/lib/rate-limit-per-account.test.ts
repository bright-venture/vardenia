import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The counters for forms that write (22 November 2026): each form on its own,
 * 20 a minute per signed-in account and 120 per connection; 20 per connection
 * when nobody is signed in. They used to share one counter of 20 per
 * connection, so twenty Questions sends used up everyone's bookings on that
 * Wi-Fi. The database counter and the sign-in check are faked.
 */
const counts = new Map<string, number>()
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    // The test request names its account in a header; a real one has a cookie.
    auth: async ({ headers }: { headers: Headers }) => {
      const who = headers.get('x-test-account')
      return { user: who ? { id: who, collection: 'customers' } : null }
    },
  })),
}))
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

const { RATE_LIMIT, checkRatePerAccount, checkRatePerKey, withRateLimit } =
  await import('./rate-limit')

const send = (account: string | null, ip = '203.0.113.7') =>
  new Request('http://localhost:3000/booking/request', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
      ...(account ? { 'x-test-account': account } : {}),
    },
    body: '{}',
  })

const NOW = 1_800_000_000_000
beforeEach(() => counts.clear())

describe('forms that write', () => {
  it('has the agreed numbers', () => {
    expect(RATE_LIMIT.WRITE_PER_WINDOW).toBe(20)
    expect(RATE_LIMIT.WRITE_CONNECTION_PER_WINDOW).toBe(120)
  })

  it('lets 40 guests on one Wi-Fi each book within a minute', async () => {
    for (let i = 0; i < 40; i++) {
      const verdict = await checkRatePerAccount(send(`guest${i}`), NOW, 'booking-request', true)
      expect(verdict.allowed).toBe(true)
    }
  })

  it('stops one account after 20 in a minute, without blocking the others', async () => {
    for (let i = 0; i < 20; i++) await checkRatePerAccount(send('sara'), NOW, 'save', true)
    expect((await checkRatePerAccount(send('sara'), NOW, 'save', true)).allowed).toBe(false)
    expect((await checkRatePerAccount(send('karim'), NOW, 'save', true)).allowed).toBe(true)
  })

  it('stops one connection running many accounts after 120 in a minute', async () => {
    for (let i = 0; i < 120; i++) await checkRatePerAccount(send(`a${i}`), NOW, 'review', true)
    const verdict = await checkRatePerAccount(send('another'), NOW, 'review', true)
    expect(verdict.allowed).toBe(false)
    expect(verdict.limit).toBe(120)
  })

  it('keeps each form on its own counters', async () => {
    for (let i = 0; i < 25; i++) await checkRatePerAccount(send(null), NOW, 'question', false)
    expect((await checkRatePerAccount(send('sara'), NOW, 'staff-request', true)).allowed).toBe(true)
    expect((await checkRatePerAccount(send(null), NOW, 'booking-request', true)).allowed).toBe(true)
  })

  it('counts the Questions form per connection, 20 a minute, signed in or not', async () => {
    for (let i = 0; i < 20; i++) await checkRatePerAccount(send(`p${i}`), NOW, 'question', false)
    expect((await checkRatePerAccount(send('p99'), NOW, 'question', false)).allowed).toBe(false)
  })

  it('counts a signed-out request per connection, 20 a minute', async () => {
    for (let i = 0; i < 20; i++) await checkRatePerAccount(send(null), NOW, 'receipt', true)
    expect((await checkRatePerAccount(send(null), NOW, 'receipt', true)).allowed).toBe(false)
  })

  it('answers 429 through the route wrapper, and leaves the body for the handler', async () => {
    const handler = vi.fn(async (request: Request) => Response.json(await request.json()))
    const wrapped = withRateLimit(handler as never, RATE_LIMIT.WRITE_PER_WINDOW, {
      action: 'booking-request',
      perAccount: true,
    })
    for (let i = 0; i < 20; i++) expect((await wrapped(send('sara'), {} as never)).status).toBe(200)
    expect((await wrapped(send('sara'), {} as never)).status).toBe(429)
    expect((await wrapped(send('karim'), {} as never)).status).toBe(200)
  })
})

describe('a polled or multi-file form (perMinute) and a counter per secret value', () => {
  it('perMinute raises one form per connection ceiling above 20, on its own counters', async () => {
    for (let i = 0; i < 40; i++) {
      expect((await checkRatePerAccount(send(null), NOW, 'place-status', false, 60)).allowed).toBe(
        true,
      )
    }
    for (let i = 0; i < 20; i++)
      await checkRatePerAccount(send(null), NOW, 'place-status', false, 60)
    const over = await checkRatePerAccount(send(null), NOW, 'place-status', false, 60)
    expect(over.allowed).toBe(false)
    expect(over.limit).toBe(60)
    // Another form on the same connection is untouched.
    expect((await checkRatePerAccount(send(null), NOW, 'place-upload', false)).allowed).toBe(true)
  })

  it('withRateLimit passes perMinute through', async () => {
    const wrapped = withRateLimit((async () => new Response('ok')) as never, undefined, {
      action: 'place-status',
      perMinute: 30,
    })
    for (let i = 0; i < 30; i++) expect((await wrapped(send(null), {} as never)).status).toBe(200)
    expect((await wrapped(send(null), {} as never)).status).toBe(429)
  })

  it('checkRatePerKey counts one secret value on its own, whatever the connection', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await checkRatePerKey('place-upload', 'token-a', 5, NOW)).allowed).toBe(true)
    }
    expect((await checkRatePerKey('place-upload', 'token-a', 5, NOW)).allowed).toBe(false)
    expect((await checkRatePerKey('place-upload', 'token-b', 5, NOW)).allowed).toBe(true)
    expect((await checkRatePerKey('place-status', 'token-a', 5, NOW)).allowed).toBe(true)
  })
})
