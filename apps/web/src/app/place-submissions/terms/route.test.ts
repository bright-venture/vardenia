import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('../../../payload.config', () => ({ default: {} }))
vi.mock('../../../lib/rate-limit', () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock('../../../lib/place-settings', () => ({ getPlaceSettings: vi.fn() }))

const { GET } = await import('./route')
const { getPlaceSettings } = await import('../../../lib/place-settings')
const { getPayload } = await import('payload')

const get = async () => {
  const response = await (GET as unknown as () => Promise<Response>)()
  return {
    status: response.status,
    cache: response.headers.get('cache-control'),
    body: (await response.json()) as Record<string, unknown>,
  }
}

beforeEach(() => {
  vi.mocked(getPlaceSettings).mockReset()
})

describe('GET /place-submissions/terms', () => {
  it('returns the price, currency, term and terms version, uncached, and nothing else', async () => {
    vi.mocked(getPlaceSettings).mockResolvedValue({
      pricePerYear: 20,
      currency: 'USD',
      termMonths: 12,
      paymentDeadlineDays: 7,
      holdMinutes: 30,
      whishNumber: '+96179300350',
      termsVersion: '2026-11',
    })
    const { status, cache, body } = await get()
    expect(status).toBe(200)
    expect(cache).toBe('no-store')
    expect(body).toEqual({
      ok: true,
      price: 20,
      currency: 'USD',
      termMonths: 12,
      termsVersion: '2026-11',
    })
    expect(JSON.stringify(body)).not.toContain('96179300350')
  })

  it('answers 500 with a plain message when the settings cannot be read', async () => {
    vi.mocked(getPayload).mockRejectedValueOnce(new Error('db down'))
    const { status, cache, body } = await get()
    expect(status).toBe(500)
    expect(cache).toBe('no-store')
    expect(body.ok).toBe(false)
  })
})
