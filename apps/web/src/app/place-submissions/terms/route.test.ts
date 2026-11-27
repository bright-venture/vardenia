import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('../../../payload.config', () => ({ default: {} }))
vi.mock('../../../lib/rate-limit', () => ({ withRateLimit: (handler: unknown) => handler }))
vi.mock('../../../lib/place-settings', () => ({ getPlaceSettings: vi.fn() }))
vi.mock('../../../lib/place-draft-price', () => ({ draftPrice: vi.fn(async () => null) }))

const { GET } = await import('./route')
const { downpaymentFor } = await import('../../../lib/place-payment-rules')
const { getPlaceSettings } = await import('../../../lib/place-settings')
const { getPayload } = await import('payload')
const { draftPrice } = await import('../../../lib/place-draft-price')

const get = async (token?: string) => {
  const request = new Request('http://x/place-submissions/terms', {
    headers: token ? { 'x-place-session': token } : {},
  })
  const response = await (GET as unknown as (r: Request) => Promise<Response>)(request)
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
  const settings = (over: Record<string, unknown> = {}) => ({
    pricePerYear: 1000,
    currency: 'USD',
    termMonths: 12,
    downpaymentPercent: 50,
    downpaymentDeadlineDays: 7,
    downpaymentReminderDay: 5,
    balanceDeadlineDays: 30,
    balanceReminderDaysBefore: 3,
    holdMinutes: 30,
    whishNumber: '+96179300350',
    termsVersion: '2026-11-24',
    ...over,
  })

  it('returns the price, term, downpayment and both deadlines, uncached, and nothing else', async () => {
    vi.mocked(getPlaceSettings).mockResolvedValue(settings())
    const { status, cache, body } = await get()
    expect(status).toBe(200)
    expect(cache).toBe('no-store')
    expect(body).toEqual({
      ok: true,
      layoutsEnabled: true,
      price: 1000,
      currency: 'USD',
      termMonths: 12,
      termsVersion: '2026-11-24',
      downpaymentPercent: 50,
      downpaymentAmount: 500,
      downpaymentDeadlineDays: 7,
      balanceDeadlineDays: 30,
    })
    // The company number and the reminder days stay private.
    expect(JSON.stringify(body)).not.toContain('96179300350')
    expect(body).not.toHaveProperty('downpaymentReminderDay')
  })

  it('rounds the downpayment to the cent exactly as the engine does', async () => {
    vi.mocked(getPlaceSettings).mockResolvedValue(
      settings({ pricePerYear: 999.99, downpaymentPercent: 33.3, balanceDeadlineDays: 45 }),
    )
    const { body } = await get()
    expect(body.downpaymentAmount).toBe(downpaymentFor(999.99, 33.3))
    expect(body.downpaymentAmount).toBe(333)
    expect(body.balanceDeadlineDays).toBe(45)
  })

  /**
   * PRD v7 section 5: a started form's terms come from its draft, so an admin
   * changing the issue's price after Next changes nothing for that form.
   */
  it("answers with the started form's own price and downpayment when its token is sent", async () => {
    vi.mocked(getPlaceSettings).mockResolvedValue(settings({ pricePerYear: 20 }))
    vi.mocked(draftPrice).mockResolvedValueOnce({ price: 800, downpaymentAmount: 400 })
    const { body } = await get('tok-123')
    expect(vi.mocked(draftPrice).mock.calls.at(-1)?.[1]).toBe('tok-123')
    expect(body.price).toBe(800)
    expect(body.downpaymentAmount).toBe(400)
    expect(body.termsVersion).toBe('2026-11-24')
  })

  it('falls back to the Settings price for a form with no saved price', async () => {
    vi.mocked(getPlaceSettings).mockResolvedValue(settings({ pricePerYear: 20 }))
    vi.mocked(draftPrice).mockResolvedValueOnce(null)
    const { body } = await get('tok-old')
    expect(body.price).toBe(20)
    expect(body.downpaymentAmount).toBe(10)
  })

  it('answers 500 with a plain message when the settings cannot be read', async () => {
    vi.mocked(getPayload).mockRejectedValueOnce(new Error('db down'))
    const { status, cache, body } = await get()
    expect(status).toBe(500)
    expect(cache).toBe('no-store')
    expect(body.ok).toBe(false)
  })
})
