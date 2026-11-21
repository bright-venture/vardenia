import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('../../../payload.config', () => ({ default: {} }))
const budgets: unknown[] = []
vi.mock('../../../lib/rate-limit', () => ({
  withRateLimit: (handler: unknown, budget?: unknown) => {
    budgets.push(budget)
    return handler
  },
}))
vi.mock('../../../lib/brands', () => ({ publicBrand: vi.fn() }))

const { GET } = await import('./route')
const { publicBrand } = await import('../../../lib/brands')

const call = async (slug: string, query = '') => {
  const response = await (
    GET as unknown as (r: Request, c: { params: Promise<{ slug: string }> }) => Promise<Response>
  )(new Request(`http://x/brand-data/${slug}${query}`), { params: Promise.resolve({ slug }) })
  return { response, body: (await response.json()) as Record<string, unknown> }
}

describe('GET /brand-data/[slug]', () => {
  beforeEach(() => vi.mocked(publicBrand).mockReset())

  it('is rate limited', () => {
    expect(budgets.length).toBe(1)
  })

  it('answers the public brand, not stored', async () => {
    vi.mocked(publicBrand).mockResolvedValue({
      name: 'Cafe Nour',
      slug: 'cafe-nour',
      logo: null,
      description: null,
      branches: [],
    })
    const { response, body } = await call('cafe-nour', '?locale=ar')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body).toMatchObject({ ok: true, brand: { name: 'Cafe Nour' } })
    expect(vi.mocked(publicBrand).mock.calls[0]!.slice(1)).toEqual(['cafe-nour', 'ar'])
  })

  it('falls back to English for an unknown locale', async () => {
    vi.mocked(publicBrand).mockResolvedValue(null)
    await call('cafe-nour', '?locale=xx')
    expect(vi.mocked(publicBrand).mock.calls[0]![2]).toBe('en')
  })

  it('is a 404 for an unknown brand or one with no published branch', async () => {
    vi.mocked(publicBrand).mockResolvedValue(null)
    const { response, body } = await call('hidden')
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body.ok).toBe(false)
  })
})
