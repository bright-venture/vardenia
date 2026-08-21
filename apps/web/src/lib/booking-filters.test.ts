import { describe, expect, it } from 'vitest'
import {
  bookingFilterQuery,
  bookingFilterWhere,
  DEFAULT_FILTER,
  isFiltered,
  parseBookingFilter,
} from './booking-filters'

/**
 * These build a database query out of a query string, so the tests that matter
 * are the ones about untrusted input and about the two windows meaning what a
 * venue thinks they mean.
 */

describe('parseBookingFilter', () => {
  it('defaults to everything still ahead', () => {
    expect(parseBookingFilter(undefined)).toEqual(DEFAULT_FILTER)
    expect(parseBookingFilter({})).toEqual(DEFAULT_FILTER)
  })

  it('keeps a status the system actually has', () => {
    expect(parseBookingFilter({ status: 'no-show' }).status).toBe('no-show')
  })

  it('ignores a status it does not', () => {
    expect(parseBookingFilter({ status: 'cancelled-ish' }).status).toBe('all')
    expect(parseBookingFilter({ status: '../../etc/passwd' }).status).toBe('all')
  })

  it('ignores an invented window rather than passing it on', () => {
    expect(parseBookingFilter({ window: 'yesterday' }).window).toBe('upcoming')
  })

  it('trims a search and treats blank as no search', () => {
    expect(parseBookingFilter({ q: '  5N9DA470 ' }).search).toBe('5N9DA470')
    expect(parseBookingFilter({ q: '   ' }).search).toBe('')
  })

  it('caps a search nobody typed', () => {
    expect(parseBookingFilter({ q: 'x'.repeat(5000) }).search).toHaveLength(100)
  })
})

describe('isFiltered', () => {
  it('is false for the view somebody lands on', () => {
    expect(isFiltered(DEFAULT_FILTER)).toBe(false)
  })

  it.each([
    [{ ...DEFAULT_FILTER, status: 'pending' as const }],
    [{ ...DEFAULT_FILTER, window: 'past' as const }],
    [{ ...DEFAULT_FILTER, search: 'ABC' }],
  ])('is true once anything is narrowed: %j', (filter) => {
    expect(isFiltered(filter)).toBe(true)
  })
})

describe('bookingFilterQuery', () => {
  it('is empty for the default, so the plain URL stays plain', () => {
    expect(bookingFilterQuery(DEFAULT_FILTER)).toBe('')
  })

  it('carries only what differs from the default', () => {
    expect(bookingFilterQuery({ status: 'pending', window: 'upcoming', search: '' })).toBe(
      '?status=pending',
    )
  })

  it('escapes what a reader typed', () => {
    expect(bookingFilterQuery({ ...DEFAULT_FILTER, search: 'a b&c' })).toBe('?q=a%20b%26c')
  })
})

describe('bookingFilterWhere', () => {
  const now = new Date('2026-08-21T12:00:00.000Z')

  it('asks for nothing when nothing is narrowed and every booking is wanted', () => {
    expect(bookingFilterWhere({ status: 'all', window: 'all', search: '' })).toEqual({})
  })

  it('filters by status', () => {
    const where = bookingFilterWhere({ status: 'pending', window: 'all', search: '' })
    expect(where).toEqual({ status: { equals: 'pending' } })
  })

  /**
   * The distinction the whole window filter turns on. A table that sat down at
   * eight has started but has not finished, and a venue looking at tonight must
   * still see it - so the split is on `end`, never on `start`.
   */
  it('counts a booking already in progress as upcoming', () => {
    const where = bookingFilterWhere({ status: 'all', window: 'upcoming', search: '' }, { now })
    expect(where).toEqual({ end: { greater_than_equal: now.toISOString() } })
  })

  it('counts a booking as past only once it has ended', () => {
    const where = bookingFilterWhere({ status: 'all', window: 'past', search: '' }, { now })
    expect(where).toEqual({ end: { less_than: now.toISOString() } })
  })

  it('searches the reference', () => {
    const where = bookingFilterWhere({ status: 'all', window: 'all', search: '5N9DA' })
    expect(where).toEqual({ reference: { like: '5N9DA' } })
  })

  it('searches the guest name too, once the caller has resolved it to ids', () => {
    const where = bookingFilterWhere(
      { status: 'all', window: 'all', search: 'Khoury' },
      { customerIds: [4, 9] },
    )

    expect(where).toEqual({
      or: [{ reference: { like: 'Khoury' } }, { customer: { in: [4, 9] } }],
    })
  })

  /**
   * "Looked for that name and found nobody" must not collapse into "no name
   * clause", which would answer a search for a stranger with every booking the
   * venue has.
   */
  it('does not widen the search when the name matched no customer', () => {
    const where = bookingFilterWhere(
      { status: 'all', window: 'all', search: 'Nobody' },
      { customerIds: [] },
    )

    expect(where).toEqual({ reference: { like: 'Nobody' } })
  })

  it('combines filters with and', () => {
    const where = bookingFilterWhere({ status: 'confirmed', window: 'past', search: '' }, { now })

    expect(where).toEqual({
      and: [{ status: { equals: 'confirmed' } }, { end: { less_than: now.toISOString() } }],
    })
  })

  /**
   * The owner's own listings are not in here on purpose. That constraint comes
   * from the Bookings collection, applied in the database from the session, and
   * a copy of it here would be a copy somebody could edit without knowing the
   * original exists.
   */
  it('never constrains by business, because that is not this function to decide', () => {
    const where = bookingFilterWhere(
      { status: 'pending', window: 'upcoming', search: 'x' },
      { now },
    )
    expect(JSON.stringify(where)).not.toContain('business')
  })
})
