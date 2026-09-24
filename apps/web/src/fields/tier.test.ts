import { describe, expect, it } from 'vitest'
import { FEATURED_PLACES, LISTING_TIERS } from '@vardenia/core'
import { TIER_LABELS, featuredPlaceCheck } from './tier'

/**
 * The home page band shows FEATURED_PLACES listings, sorted by name. A featured
 * listing beyond that number would be paid for and never shown, so the admin
 * refuses it instead.
 */
describe('featured places', () => {
  it('lets a listing in while a place is free', () => {
    expect(featuredPlaceCheck(0)).toBe(true)
    expect(featuredPlaceCheck(FEATURED_PLACES - 1)).toBe(true)
  })

  it('refuses one more once every place is taken', () => {
    const refusal = featuredPlaceCheck(FEATURED_PLACES)
    expect(refusal).not.toBe(true)
    expect(refusal).toContain(String(FEATURED_PLACES))
  })

  it('refuses when the count has somehow gone over', () => {
    expect(featuredPlaceCheck(FEATURED_PLACES + 3)).not.toBe(true)
  })

  it('names the way out in its refusal', () => {
    expect(featuredPlaceCheck(FEATURED_PLACES)).toContain('Untick featured')
  })

  it('follows a different number of places', () => {
    expect(featuredPlaceCheck(2, 3)).toBe(true)
    expect(featuredPlaceCheck(3, 3)).not.toBe(true)
  })
})

describe('tier labels', () => {
  /**
   * A ladder name says where a tier sits, not what it contains, so the label
   * carries both.
   */
  it('says what each tier includes, not only its name', () => {
    for (const tier of LISTING_TIERS) {
      expect(TIER_LABELS[tier], tier).toMatch(/\(.+\)/)
    }
    expect(TIER_LABELS.silver).toContain('magazine')
    expect(TIER_LABELS.basic).toContain('no magazine')
  })
})
