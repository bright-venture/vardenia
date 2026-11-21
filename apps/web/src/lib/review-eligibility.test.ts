import { describe, expect, it } from 'vitest'
import { reviewEligibility } from './review-eligibility'

const ok = {
  status: 'completed',
  guestAnswer: null,
  subcategories: ['restaurants'],
  bookingEnabled: true,
  alreadyReviewed: false,
}

describe('reviewEligibility', () => {
  it('allows a completed booking at a bookable listing not yet reviewed', () => {
    expect(reviewEligibility(ok)).toEqual({ ok: true })
  })

  it('allows it when the guest confirmed they came', () => {
    expect(reviewEligibility({ ...ok, guestAnswer: 'came' })).toEqual({ ok: true })
  })

  it.each(['confirmed', 'pending', 'cancelled', 'no-show'])('refuses a %s booking', (status) => {
    expect(reviewEligibility({ ...ok, status })).toEqual({ ok: false, code: 'not-eligible' })
  })

  it('refuses when the guest said they did not come, even if completed', () => {
    expect(reviewEligibility({ ...ok, guestAnswer: 'did-not-come' })).toEqual({
      ok: false,
      code: 'not-eligible',
    })
  })

  it('refuses a listing that is not bookable', () => {
    expect(reviewEligibility({ ...ok, subcategories: ['cafes'] })).toEqual({
      ok: false,
      code: 'not-bookable',
    })
    expect(reviewEligibility({ ...ok, bookingEnabled: false })).toEqual({
      ok: false,
      code: 'not-bookable',
    })
    expect(reviewEligibility({ ...ok, bookingEnabled: undefined, subcategories: null })).toEqual({
      ok: false,
      code: 'not-bookable',
    })
  })

  it('refuses a listing already reviewed', () => {
    expect(reviewEligibility({ ...ok, alreadyReviewed: true })).toEqual({
      ok: false,
      code: 'already-reviewed',
    })
  })

  it('accepts a listing with one bookable and one non-bookable kind, a hotel and a guest house', () => {
    expect(reviewEligibility({ ...ok, subcategories: ['cafes', 'restaurants'] }).ok).toBe(true)
    expect(reviewEligibility({ ...ok, subcategories: ['hotels'] }).ok).toBe(true)
    expect(reviewEligibility({ ...ok, subcategories: ['getaways'] }).ok).toBe(true)
  })
})
