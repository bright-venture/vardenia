import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock('payload', () => ({ getPayload: vi.fn() }))
vi.mock('../../../payload.config', () => ({ default: {} }))
vi.mock('../../../lib/rate-limit', () => ({
  RATE_LIMIT: { WRITE_PER_WINDOW: 20 },
  withRateLimit: (handler: (request: Request) => Promise<Response>) => handler,
}))
vi.mock('../../../lib/report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('../../../lib/booking-service', () => ({ createBooking: vi.fn() }))
vi.mock('../../../lib/booking-email', () => ({
  sendBookingConfirmation: vi.fn(async () => true),
  notifyVenueOfBooking: vi.fn(async () => 1),
}))

const { POST } = await import('./route')
const { getPayload } = await import('payload')
const { createBooking } = await import('../../../lib/booking-service')
const { sendBookingConfirmation, notifyVenueOfBooking } = await import('../../../lib/booking-email')

/**
 * /booking/request and the price (Task 7): the server quotes; whatever price a
 * client sends is stripped before the booking service sees the request.
 */
const post = async (body: unknown) => {
  const response = await (POST as unknown as (request: Request) => Promise<Response>)(
    new Request('http://x/booking/request', { method: 'POST', body: JSON.stringify(body) }),
  )
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

const body = {
  business: 20,
  start: '2030-06-01T12:00:00.000Z',
  end: '2030-06-03T08:00:00.000Z',
  partySize: 2,
  packageId: 'wknd',
}

beforeEach(() => {
  vi.mocked(getPayload).mockResolvedValue({
    auth: vi.fn(async () => ({
      user: { id: 5, collection: 'customers', _verified: true, email: 'a@b.co', name: 'Sami' },
    })),
  } as never)
  vi.mocked(createBooking).mockReset()
  vi.mocked(sendBookingConfirmation).mockClear()
  vi.mocked(notifyVenueOfBooking).mockClear()
})

describe('POST /booking/request and the price', () => {
  it('strips a forged price, quote or total before the booking service', async () => {
    vi.mocked(createBooking).mockResolvedValue({
      ok: true,
      reference: 'REF00001',
      status: 'pending',
      bookingId: 1,
      businessId: 20,
      businessName: 'Beit Douma',
      total: 300,
    })
    const { status } = await post({
      ...body,
      price: { total: 1, currency: 'USD', nights: 2, lines: [{ label: 'cheap', amount: 1 }] },
      quote: { ok: true, total: 1 },
      total: 1,
    })
    expect(status).toBe(201)
    const request = vi.mocked(createBooking).mock.calls[0]![0].request as Record<string, unknown>
    expect(request).not.toHaveProperty('price')
    expect(request).not.toHaveProperty('quote')
    expect(request).not.toHaveProperty('total')
    expect(request.packageId).toBe('wknd')
  })

  it('puts the server total in both emails', async () => {
    vi.mocked(createBooking).mockResolvedValue({
      ok: true,
      reference: 'REF00001',
      status: 'pending',
      bookingId: 1,
      businessId: 20,
      businessName: 'Beit Douma',
      total: 300,
    })
    await post({ ...body, total: 1 })
    expect(vi.mocked(sendBookingConfirmation).mock.calls[0]![0]).toMatchObject({ total: 300 })
    expect(vi.mocked(notifyVenueOfBooking).mock.calls[0]![0]).toMatchObject({ total: 300 })
  })

  it('returns the stored total with the reference, and no price when none was stored', async () => {
    vi.mocked(createBooking).mockResolvedValue({
      ok: true,
      reference: 'REF00001',
      status: 'pending',
      bookingId: 1,
      businessId: 20,
      businessName: 'Beit Douma',
      total: 300,
    })
    const priced = await post(body)
    expect(priced.status).toBe(201)
    expect(priced.body).toEqual({
      ok: true,
      reference: 'REF00001',
      status: 'pending',
      email: 'a@b.co',
      price: { total: 300, currency: 'USD' },
    })
    vi.mocked(createBooking).mockResolvedValue({
      ok: true,
      reference: 'REF00002',
      status: 'confirmed',
      bookingId: 2,
      businessId: 20,
      businessName: 'Beit Douma',
    })
    const unpriced = await post(body)
    expect(unpriced.body).not.toHaveProperty('price')
    expect(unpriced.body).toMatchObject({ ok: true, reference: 'REF00002' })
  })

  it('answers an unpriceable request (an unknown package) with 400', async () => {
    vi.mocked(createBooking).mockResolvedValue({
      ok: false,
      code: 'invalid',
      message: 'That package is not offered here.',
    })
    const { status, body: answer } = await post(body)
    expect(status).toBe(400)
    expect(answer).toMatchObject({ ok: false, message: 'That package is not offered here.' })
  })
})
