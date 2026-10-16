import { describe, expect, it } from 'vitest'
import { DESTINATIONS, matchesFeeling, type Feeling } from './destinations'
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
        DESTINATIONS.some((place) => matchesFeeling(place, theme)),
        theme,
      ).toBe(true)
  })
  it('lets coastal heritage places appear under several interests', () => {
    const byblos = DESTINATIONS.find((place) => place.id === 'byblos')!
    expect(matchesFeeling(byblos, 'coast')).toBe(true)
    expect(matchesFeeling(byblos, 'heritage')).toBe(true)
    expect(matchesFeeling(byblos, 'harbours')).toBe(true)
    expect(matchesFeeling(byblos, 'mountain')).toBe(false)
    expect(
      DESTINATIONS.filter((place) => matchesFeeling(place, 'villages')).map((place) => place.id),
    ).toContain('deir-el-qamar')
  })
})
