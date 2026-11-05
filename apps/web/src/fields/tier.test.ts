import { describe, expect, it } from 'vitest'
import { HOME_PAGE_PLACES, LISTING_TIERS } from '@vardenia/core'
import { TIER_LABELS, goldPlaceCheck } from './tier'

/**
 * The home page band shows HOME_PAGE_PLACES listings, the gold ones. A gold
 * listing beyond that number would be paid for and never shown, so the admin
 * refuses it instead.
 */
describe('gold places', () => {
  it('lets a listing in while a place is free', () => {
    expect(goldPlaceCheck(0)).toBe(true)
    expect(goldPlaceCheck(HOME_PAGE_PLACES - 1)).toBe(true)
  })

  it('refuses one more once every place is taken', () => {
    const refusal = goldPlaceCheck(HOME_PAGE_PLACES)
    expect(refusal).not.toBe(true)
    expect(refusal).toContain(String(HOME_PAGE_PLACES))
  })

  it('refuses when the count has somehow gone over', () => {
    expect(goldPlaceCheck(HOME_PAGE_PLACES + 3)).not.toBe(true)
  })

  it('names the way out in its refusal', () => {
    expect(goldPlaceCheck(HOME_PAGE_PLACES)).toContain('Move one of them to silver')
  })

  it('follows a different number of places', () => {
    expect(goldPlaceCheck(2, 3)).toBe(true)
    expect(goldPlaceCheck(3, 3)).not.toBe(true)
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
    expect(TIER_LABELS.bronze).toContain('no magazine')
    expect(TIER_LABELS.gold).toContain('home page')
  })
})
