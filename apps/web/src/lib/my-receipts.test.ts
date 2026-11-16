import { describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('payload', () => ({ getPayload: vi.fn() }))
vi.mock('../payload.config', () => ({ default: {} }))

const { toMyReceipt, receiptsForCurrent } = await import('./my-receipts')
const { getPayload } = await import('payload')

/** One receipt as "My receipts" shows it, whatever shape the booking came back in. */

const receipt = (over: Record<string, unknown> = {}) => ({
  id: 3,
  createdAt: '2026-11-04T09:00:00.000Z',
  amount: 84.5,
  currency: 'USD',
  url: '/api/receipts/file/receipt-abc.jpg',
  mimeType: 'image/jpeg',
  booking: {
    start: '2026-11-02T17:00:00.000Z',
    business: { name: 'Chez Nouna', slug: 'chez-nouna', _status: 'published' },
  },
  ...over,
})

describe('a receipt on "My receipts"', () => {
  it('shows the place, the visit, the total and the protected file link', () => {
    expect(toMyReceipt(receipt())).toEqual({
      id: 3,
      place: 'Chez Nouna',
      slug: 'chez-nouna',
      visit: new Date('2026-11-02T17:00:00.000Z'),
      sentAt: new Date('2026-11-04T09:00:00.000Z'),
      amount: 84.5,
      currency: 'USD',
      fileUrl: '/api/receipts/file/receipt-abc.jpg',
      isPdf: false,
    })
  })

  it('does not link a place that is no longer published', () => {
    const doc = receipt({
      booking: { start: null, business: { name: 'Gone', slug: 'gone', _status: 'draft' } },
    })
    expect(toMyReceipt(doc)).toMatchObject({ place: 'Gone', slug: '', visit: null })
  })

  it('still renders when the booking or the listing did not come back populated', () => {
    expect(toMyReceipt(receipt({ booking: 41 }))).toMatchObject({
      place: '',
      slug: '',
      visit: null,
    })
  })

  it('knows a PDF from a photo, and keeps pounds as pounds', () => {
    const doc = receipt({ mimeType: 'application/pdf', currency: 'LBP', amount: 2_500_000 })
    expect(toMyReceipt(doc)).toMatchObject({ isPdf: true, currency: 'LBP', amount: 2_500_000 })
  })
})

/**
 * Payload builds an upload's `url` from its filename. Selected without it, the
 * url came back empty and the "View receipt" link never showed (16 November
 * 2026). The query has to ask for both.
 */
describe('the query behind "My receipts"', () => {
  it('selects the filename with the url, so the file link is built', async () => {
    const find = vi.fn(async () => ({ docs: [] }))
    vi.mocked(getPayload).mockResolvedValue({
      auth: async () => ({ user: { id: 7, collection: 'customers' } }),
      find,
    } as never)

    await receiptsForCurrent('en')

    const select = (find.mock.calls[0] as unknown as [{ select: Record<string, boolean> }])[0]
      .select
    expect(select).toMatchObject({ url: true, filename: true })
  })
})
