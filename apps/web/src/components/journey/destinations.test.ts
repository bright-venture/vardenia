import { describe, expect, it } from 'vitest'
import { GOVERNORATES } from '@vardenia/core'
import { parseFilterState } from '../ListingFilters'
import { DESTINATIONS, destinationHref, directoryFor, sceneDirectoryFor } from './destinations'

/**
 * Every destination's "Explore this region" link must actually filter the
 * directory. The directory drops a `where` it does not recognise, so a link
 * that names a city as `where` silently opens the whole directory.
 */
describe('directoryFor', () => {
  it.each(DESTINATIONS.map((p) => [p.id, p] as const))(
    '%s opens the directory filtered to its area',
    (_, p) => {
      const query = new URLSearchParams(directoryFor(p).split('?')[1] ?? '')
      const state = parseFilterState(
        { where: query.get('where') ?? undefined, city: query.get('city') ?? undefined },
        [],
      )
      const isGovernorate = GOVERNORATES.some((g) => g.slug === p.where)
      expect(state.governorate, 'governorate is understood').toBeDefined()
      if (!isGovernorate) expect(state.city).toBe(p.where)
    },
  )

  it('names the governorate of a city', () => {
    expect(directoryFor({ where: 'jbeil' })).toBe('/directory?where=keserwan&city=jbeil')
    expect(directoryFor({ where: 'tyre' })).toBe('/directory?where=south-lebanon&city=tyre')
    expect(directoryFor({ where: 'beirut' })).toBe('/directory?where=beirut')
  })
})

it('links English Byblos photos and postcards to the same guide', () => {
  const byblos = DESTINATIONS.find((place) => place.id === 'byblos')!
  expect(destinationHref(byblos, 'en')).toBe('/destinations/byblos')
  expect(sceneDirectoryFor('byblos-harbour', 'en')).toBe('/destinations/byblos')
  expect(destinationHref(byblos, 'ar')).toBe(directoryFor(byblos))
})
