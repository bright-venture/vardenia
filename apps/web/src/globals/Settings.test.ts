import { describe, expect, it } from 'vitest'
import { HOME_PAGE_PLACES } from '@vardenia/core'
import { placesFloorCheck } from './Settings'
import { placesOrDefault } from '../lib/gold-places'

/**
 * The number of gold places, which an admin sets: how many the home page band
 * shows, and so how many gold listings can be sold.
 */
describe('gold places', () => {
  it('uses the default while the setting is empty or unusable', () => {
    for (const value of [null, undefined, 0, -2, 2.5, '8']) {
      expect(placesOrDefault(value), String(value)).toBe(HOME_PAGE_PLACES)
    }
    expect(placesOrDefault(10)).toBe(10)
  })

  it('can be raised, or lowered down to the gold listings already sold', () => {
    expect(placesFloorCheck(10, 6)).toBe(true)
    expect(placesFloorCheck(4, 4)).toBe(true)
  })

  /** Lower than that, and some paid gold listings would fall off the home page. */
  it('cannot go below the gold listings there are, and says how to get there', () => {
    const refusal = placesFloorCheck(4, 6)
    expect(refusal).not.toBe(true)
    expect(refusal).toContain('6 gold listings')
    expect(refusal).toContain('Move 2 of them to silver')
  })
})
