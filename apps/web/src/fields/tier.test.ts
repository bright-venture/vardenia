import { describe, expect, it } from 'vitest'
import { DEFAULT_MAX_GOLD_PER_CATEGORY, DEFAULT_MAX_PLATINUM, LISTING_TIERS } from '@vardenia/core'
import { TIER_LABELS, goldPlaceCheck, platinumPlaceCheck, tierField } from './tier'
import { HOME_PAGE_TIERS } from '../lib/tier-limits'

/**
 * Gold is the top of its category, with a cap per category. A gold listing
 * beyond that would be paid for and never shown first, so the admin refuses it.
 */
describe('gold places per category', () => {
  it('lets a listing in while the category has a place free', () => {
    expect(goldPlaceCheck(0)).toBe(true)
    expect(goldPlaceCheck(DEFAULT_MAX_GOLD_PER_CATEGORY - 1)).toBe(true)
  })

  it('refuses one more once every place in the category is taken, naming the limit', () => {
    const refusal = goldPlaceCheck(DEFAULT_MAX_GOLD_PER_CATEGORY)
    expect(refusal).not.toBe(true)
    expect(refusal).toContain(String(DEFAULT_MAX_GOLD_PER_CATEGORY))
    expect(refusal).toContain('category')
  })

  it('refuses when the count has somehow gone over', () => {
    expect(goldPlaceCheck(DEFAULT_MAX_GOLD_PER_CATEGORY + 3)).not.toBe(true)
  })

  it('names the way out in its refusal', () => {
    expect(goldPlaceCheck(DEFAULT_MAX_GOLD_PER_CATEGORY)).toContain('Move one of them to silver')
  })

  it('follows a different number of places', () => {
    expect(goldPlaceCheck(2, 3)).toBe(true)
    expect(goldPlaceCheck(3, 3)).not.toBe(true)
  })
})

describe('platinum places overall', () => {
  it('lets a listing in while a place is free, and refuses at the limit', () => {
    expect(platinumPlaceCheck(DEFAULT_MAX_PLATINUM - 1)).toBe(true)
    const refusal = platinumPlaceCheck(DEFAULT_MAX_PLATINUM)
    expect(refusal).not.toBe(true)
    expect(refusal).toContain(String(DEFAULT_MAX_PLATINUM))
    expect(refusal).toContain('home page')
  })

  it('follows a different number of places', () => {
    expect(platinumPlaceCheck(2, 3)).toBe(true)
    expect(platinumPlaceCheck(3, 3)).not.toBe(true)
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
    expect(TIER_LABELS.gold).toContain('category')
    expect(TIER_LABELS.platinum).toContain('home page')
  })
})

describe('sort order and the home page band', () => {
  /**
   * Every listing grid sorts on `-tier`, the Postgres enum's declaration order,
   * which comes from these options. So the options must run bronze to
   * platinum, and `-tier` puts platinum, gold, silver, bronze.
   */
  it('declares the select options in ladder order, so -tier ranks platinum first', () => {
    const values = (tierField.options as { value: string }[]).map((o) => o.value)
    expect(values).toEqual(['bronze', 'silver', 'gold', 'platinum'])
    expect([...values].reverse()).toEqual(['platinum', 'gold', 'silver', 'bronze'])
  })

  it('draws the home page band from platinum only', () => {
    expect(HOME_PAGE_TIERS).toEqual(['platinum'])
  })
})
