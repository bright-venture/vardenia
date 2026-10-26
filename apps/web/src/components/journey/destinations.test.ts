import { describe, expect, it } from 'vitest'
import { GOVERNORATES } from '@vardenia/core'
import { parseFilterState } from '../ListingFilters'
import { DESTINATIONS, directoryFor } from './destinations'

/**
 * Every destination's "Explore this region" link must actually filter the
 * directory. The directory drops a `where` it does not recognise, so a link
 * that names a district as `where` silently opens the whole directory.
 */
describe('directoryFor', () => {
  it.each(DESTINATIONS.map((p) => [p.id, p] as const))(
    '%s opens the directory filtered to its area',
    (_, p) => {
      const query = new URLSearchParams(directoryFor(p).split('?')[1] ?? '')
      const state = parseFilterState(
        { where: query.get('where') ?? undefined, district: query.get('district') ?? undefined },
        [],
      )
      const isGovernorate = GOVERNORATES.some((g) => g.slug === p.where)
      expect(state.governorate, 'governorate is understood').toBeDefined()
      if (!isGovernorate) expect(state.district).toBe(p.where)
    },
  )

  it('names the governorate of a district', () => {
    expect(directoryFor({ where: 'jbeil' })).toBe('/directory?where=keserwan-jbeil&district=jbeil')
    expect(directoryFor({ where: 'tyre' })).toBe('/directory?where=south-lebanon&district=tyre')
    expect(directoryFor({ where: 'beirut' })).toBe('/directory?where=beirut')
  })
})
