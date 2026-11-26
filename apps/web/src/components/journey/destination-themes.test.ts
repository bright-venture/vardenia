import { describe, expect, it } from 'vitest'
import { FEATURED_DESTINATIONS, matchesFeeling, type Feeling } from './destinations'
describe('discovery themes', () => {
  it('offers a destination for every displayed theme', () => {
    const themes: Feeling[] = [
      'all',
      'coast',
      'mountain',
      'heritage',
      'nature',
      'villages',
      'harbours',
      'sunsets',
    ]
    for (const theme of themes)
      expect(
        FEATURED_DESTINATIONS.some((place) => matchesFeeling(place, theme)),
        theme,
      ).toBe(true)
  })
  it('lets coastal heritage places appear under several interests', () => {
    const batroun = FEATURED_DESTINATIONS.find((place) => place.id === 'batroun-harbour')!
    expect(matchesFeeling(batroun, 'coast')).toBe(true)
    expect(matchesFeeling(batroun, 'heritage')).toBe(true)
    expect(matchesFeeling(batroun, 'harbours')).toBe(true)
    expect(matchesFeeling(batroun, 'mountain')).toBe(false)
    expect(
      FEATURED_DESTINATIONS.filter((place) => matchesFeeling(place, 'villages')).map(
        (place) => place.id,
      ),
    ).toContain('sawfar-autumn')
  })
})
