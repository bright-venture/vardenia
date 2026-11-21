import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { createReview } from './review-service'

/**
 * Who may review. The rule is the lead's: reviews exist only for bookable
 * services; the customer books, the business marks the visit completed, and only
 * then can that customer write a review for that listing, once.
 *
 * The fake payload evaluates the booking query the service builds, so a service
 * that asks the database for the wrong statuses fails here rather than passing
 * against a canned answer.
 */

interface BookingRow {
  id: number
  customer: number
  business: number
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no-show'
  end: string
  guestAnswer?: 'came' | 'did-not-come' | null
}

const HOUR = 60 * 60 * 1000
const past = new Date(Date.now() - 24 * HOUR).toISOString()

type Clause = Record<string, Record<string, unknown>> & { and?: Clause[]; or?: Clause[] }

const matches = (row: Record<string, unknown>, where: Clause): boolean => {
  if (where.and) return where.and.every((w) => matches(row, w))
  if (where.or) return where.or.some((w) => matches(row, w))
  return Object.entries(where).every(([field, op]) => {
    const value = row[field]
    if ('equals' in op) return value === op.equals
    if ('less_than' in op) return String(value) < String(op.less_than)
    return false
  })
}

const SUBCATS = { restaurants: ['restaurants'], cafes: ['cafes'], nightlife: ['nightlife'] }

function setup(opts: {
  bookings?: BookingRow[]
  reviews?: Array<{ customer: number; business: number; booking?: number }>
  business?: Record<string, unknown> | null
}) {
  const created: Array<Record<string, unknown>> = []
  const business =
    opts.business === undefined
      ? {
          id: 10,
          _status: 'published',
          subcategories: SUBCATS.restaurants,
          booking: { enabled: true },
        }
      : opts.business
  const payload = {
    findByID: vi.fn(async () => {
      if (!business) throw new Error('not found')
      return business
    }),
    find: vi.fn(async ({ collection, where }: { collection: string; where: Clause }) => {
      const rows = (collection === 'bookings' ? opts.bookings : opts.reviews) ?? []
      return { docs: rows.filter((r) => matches(r as never, where)).slice(0, 1) }
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      created.push(data)
      return { id: 99 }
    }),
  } as unknown as Payload
  const run = (customerId = 5) =>
    createReview({
      payload,
      request: { business: 10, rating: 5, body: 'A really lovely evening.' },
      customerId,
      customerName: 'Rania Haddad',
    })
  return { run, created }
}

const booking = (over: Partial<BookingRow> = {}): BookingRow => ({
  id: 1,
  customer: 5,
  business: 10,
  status: 'completed',
  end: past,
  ...over,
})

describe('who may review a listing', () => {
  it('accepts the customer of a completed booking, as a pending review tied to that booking', async () => {
    const { run, created } = setup({ bookings: [booking()] })
    expect(await run()).toEqual({ ok: true, reviewId: 99 })
    expect(created[0]).toMatchObject({
      business: 10,
      customer: 5,
      booking: 1,
      status: 'pending',
      authorName: 'Rania H.',
    })
  })

  it('refuses a customer with no booking at that listing', async () => {
    const { run } = setup({ bookings: [] })
    expect(await run()).toEqual({ ok: false, code: 'not-eligible' })
  })

  it('refuses a different customer than the one who booked', async () => {
    const { run } = setup({ bookings: [booking({ customer: 6 })] })
    expect(await run(5)).toEqual({ ok: false, code: 'not-eligible' })
  })

  it('refuses a completed booking at a different listing', async () => {
    const { run } = setup({ bookings: [booking({ business: 11 })] })
    expect(await run()).toEqual({ ok: false, code: 'not-eligible' })
  })

  it.each(['pending', 'cancelled', 'no-show'] as const)('refuses a %s booking', async (status) => {
    const { run } = setup({ bookings: [booking({ status })] })
    expect(await run()).toEqual({ ok: false, code: 'not-eligible' })
  })

  // Only the business saying the guest came makes a visit; a confirmed booking
  // whose time has passed is not enough on its own.
  it('refuses a confirmed booking even when its time has passed', async () => {
    const { run } = setup({ bookings: [booking({ status: 'confirmed' })] })
    expect(await run()).toEqual({ ok: false, code: 'not-eligible' })
  })

  it('refuses a booking the guest said they did not attend', async () => {
    const { run } = setup({ bookings: [booking({ guestAnswer: 'did-not-come' })] })
    expect(await run()).toEqual({ ok: false, code: 'not-eligible' })
  })

  it('accepts when the guest confirmed they came', async () => {
    const { run } = setup({ bookings: [booking({ guestAnswer: 'came' })] })
    expect((await run()).ok).toBe(true)
  })

  it('refuses a second review for the same booking', async () => {
    const { run, created } = setup({
      bookings: [booking()],
      reviews: [{ customer: 5, business: 10, booking: 1 }],
    })
    expect(await run()).toEqual({ ok: false, code: 'already-reviewed' })
    expect(created).toHaveLength(0)
  })

  it('treats a draft listing as not found', async () => {
    const { run } = setup({
      bookings: [booking()],
      business: {
        id: 10,
        _status: 'draft',
        subcategories: SUBCATS.restaurants,
        booking: { enabled: true },
      },
    })
    expect(await run()).toEqual({ ok: false, code: 'not-found' })
  })
})

describe('bookable kinds', () => {
  it.each([
    ['a hotel', ['hotels']],
    ['a guest house', ['getaways']],
    ['a listing with one bookable and one non-bookable kind', ['cafes', 'restaurants']],
  ])('allows %s', async (_label, subcategories) => {
    const { run } = setup({
      bookings: [booking()],
      business: { id: 10, _status: 'published', subcategories, booking: { enabled: true } },
    })
    expect((await run()).ok).toBe(true)
  })
})

describe('listings that do not take bookings cannot be reviewed', () => {
  it('refuses when booking is switched off, even with a completed booking row', async () => {
    const { run, created } = setup({
      bookings: [booking()],
      business: {
        id: 10,
        _status: 'published',
        subcategories: SUBCATS.restaurants,
        booking: { enabled: false },
      },
    })
    expect(await run()).toEqual({ ok: false, code: 'not-bookable' })
    expect(created).toHaveLength(0)
  })

  it('refuses when the listing has no booking settings at all', async () => {
    const { run } = setup({
      bookings: [booking()],
      business: { id: 10, _status: 'published', subcategories: SUBCATS.restaurants },
    })
    expect(await run()).toEqual({ ok: false, code: 'not-bookable' })
  })

  it.each(['cafes', 'pools', 'nightlife', 'historic-sites', 'festivals', 'malls', 'gyms'])(
    'refuses a %s listing even if booking.enabled and a completed booking exist',
    async (slug) => {
      const { run, created } = setup({
        bookings: [booking()],
        business: {
          id: 10,
          _status: 'published',
          subcategories: [slug],
          booking: { enabled: true },
        },
      })
      expect(await run()).toEqual({ ok: false, code: 'not-bookable' })
      expect(created).toHaveLength(0)
    },
  )
})
