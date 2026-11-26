import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock('payload', () => ({ getPayload: vi.fn() }))
vi.mock('../../payload.config', () => ({ default: {} }))
vi.mock('../../lib/rate-limit', () => ({
  RATE_LIMIT: { WRITE_PER_WINDOW: 20 },
  withRateLimit: (handler: (request: Request) => Promise<Response>) => handler,
}))
vi.mock('../../lib/report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('../../lib/review-service', () => ({ createReview: vi.fn() }))

const { POST } = await import('./route')
const { getPayload } = await import('payload')
const { createReview } = await import('../../lib/review-service')

const post = async () => {
  const response = await (POST as unknown as (request: Request) => Promise<Response>)(
    new Request('http://x/reviews', {
      method: 'POST',
      body: JSON.stringify({ business: 10, rating: 5, body: 'A really lovely evening.' }),
    }),
  )
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

beforeEach(() => {
  vi.mocked(getPayload).mockResolvedValue({
    auth: vi.fn(async () => ({
      user: { id: 5, collection: 'customers', _verified: true, name: 'Sami Haddad' },
    })),
  } as never)
  vi.mocked(createReview).mockReset()
})

describe('POST /reviews refusals', () => {
  it.each([
    ['not-eligible', 403],
    ['not-bookable', 403],
    ['already-reviewed', 409],
    ['not-found', 404],
  ] as const)('maps %s to %i with { ok: false, code }', async (code, status) => {
    vi.mocked(createReview).mockResolvedValue({ ok: false, code })
    expect(await post()).toEqual({ status, body: { ok: false, code } })
  })

  it('answers 201 with { ok: true } for a created review', async () => {
    vi.mocked(createReview).mockResolvedValue({ ok: true, reviewId: 1 })
    expect(await post()).toEqual({ status: 201, body: { ok: true } })
  })
})
