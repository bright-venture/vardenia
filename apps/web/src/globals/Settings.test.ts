import { describe, expect, it } from 'vitest'
import { DEFAULT_MAX_GOLD_PER_CATEGORY, DEFAULT_MAX_PLATINUM } from '@vardenia/core'
import { goldFloorCheck, highestPerCategory, placePriceCheck, platinumFloorCheck } from './Settings'
import { limitOrDefault } from '../lib/tier-limits'

/**
 * The two numbers an admin sets: gold per category, and platinum overall (the
 * home page band).
 */
describe('tier limits', () => {
  it('use the default while the setting is empty or unusable', () => {
    for (const value of [null, undefined, 0, -2, 2.5, '8']) {
      expect(limitOrDefault(value, DEFAULT_MAX_PLATINUM), String(value)).toBe(DEFAULT_MAX_PLATINUM)
    }
    expect(limitOrDefault(10, DEFAULT_MAX_GOLD_PER_CATEGORY)).toBe(10)
  })
})

describe('lowering the platinum limit', () => {
  it('can be raised, or lowered down to the platinum listings already sold', () => {
    expect(platinumFloorCheck(10, 6)).toBe(true)
    expect(platinumFloorCheck(4, 4)).toBe(true)
  })

  it('cannot go below the platinum listings there are, and says how to get there', () => {
    const refusal = platinumFloorCheck(4, 6)
    expect(refusal).not.toBe(true)
    expect(refusal).toContain('6 platinum listings')
    expect(refusal).toContain('Move 2 of them to gold')
  })
})

describe('lowering the gold limit per category', () => {
  it('can be lowered down to the fullest category', () => {
    expect(goldFloorCheck(5, { category: 'hospitality', count: 5 })).toBe(true)
    expect(goldFloorCheck(5, null)).toBe(true)
  })

  it('cannot go below the fullest category, naming it', () => {
    const refusal = goldFloorCheck(2, { category: 'hospitality', count: 5 })
    expect(refusal).not.toBe(true)
    expect(refusal).toContain('hospitality')
    expect(refusal).toContain('5 gold listings')
    expect(refusal).toContain('Move 3 of them to silver')
  })

  it('finds the fullest category from a list of gold listings', () => {
    expect(highestPerCategory([])).toBeNull()
    expect(
      highestPerCategory([
        { category: 'tourism' },
        { category: 'hospitality' },
        { category: 'hospitality' },
        { category: 'tourism' },
        { category: 'hospitality' },
      ]),
    ).toEqual({ category: 'hospitality', count: 3 })
  })
})

describe('the price of a magazine place', () => {
  it('is at least 1: no free places, with a plain message', () => {
    for (const value of [0, 0.5, -1, null, undefined, Number.NaN]) {
      expect(placePriceCheck(value), String(value)).toBe(
        'Enter the price of one year: 1 or more. Places are never free.',
      )
    }
    expect(placePriceCheck(1)).toBe(true)
    expect(placePriceCheck(1000)).toBe(true)
  })
})
