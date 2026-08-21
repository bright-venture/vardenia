import { describe, expect, it } from 'vitest'
import { filterHref, type FilterState } from './ListingFilters'

/**
 * Every filtered view is a URL, so this builder is what makes them shareable,
 * indexable and cacheable. Two things have to hold:
 *
 * - the same view always produces the same string, or one page becomes several
 *   to a search engine and several entries in the cache;
 * - changing one facet never silently corrupts another.
 */

const base = '/stay'
const empty: FilterState = { amenities: [] }

const state = (over: Partial<FilterState> = {}): FilterState => ({ ...empty, ...over })

describe('filterHref', () => {
  it('returns the bare path when nothing is filtered', () => {
    expect(filterHref(base, empty, {})).toBe('/stay')
  })

  it('adds one facet', () => {
    expect(filterHref(base, empty, { subcategory: 'boutique-hotels' })).toBe(
      '/stay?filter=boutique-hotels',
    )
    expect(filterHref(base, empty, { priceRange: '3' })).toBe('/stay?price=3')
  })

  it('keeps the facets already chosen', () => {
    const current = state({ subcategory: 'boutique-hotels' })
    expect(filterHref(base, current, { governorate: 'mount-lebanon' })).toBe(
      '/stay?filter=boutique-hotels&where=mount-lebanon',
    )
  })

  it('removes a facet when it is cleared', () => {
    const current = state({ subcategory: 'boutique-hotels', governorate: 'beirut' })
    expect(filterHref(base, current, { subcategory: undefined })).toBe('/stay?where=beirut')
  })

  /**
   * A district belongs to one governorate. Carrying it across to another gives a
   * pair that can never match, on a page that looks deliberately filtered - the
   * reader sees an empty section and no reason for it.
   */
  it('drops the district when the governorate changes', () => {
    const current = state({ governorate: 'mount-lebanon', district: 'keserwan' })
    expect(filterHref(base, current, { governorate: 'beirut' })).toBe('/stay?where=beirut')
  })

  it('keeps the district when the governorate is unchanged', () => {
    const current = state({ governorate: 'mount-lebanon', district: 'keserwan' })
    expect(filterHref(base, current, { priceRange: '2' })).toBe(
      '/stay?where=mount-lebanon&district=keserwan&price=2',
    )
  })

  it('carries several amenities, sorted', () => {
    expect(filterHref(base, empty, { amenities: ['pool', 'accessible'] })).toBe(
      '/stay?has=accessible,pool',
    )
  })

  /**
   * The same set in a different order has to produce the same URL. Otherwise
   * ticking pool then spa and ticking spa then pool are two different pages with
   * identical content, and two cache entries for one result.
   */
  it('produces one URL per view, whatever order the facets were chosen in', () => {
    const a = filterHref(base, state({ amenities: ['spa', 'pool'] }), {})
    const b = filterHref(base, state({ amenities: ['pool', 'spa'] }), {})
    expect(a).toBe(b)
  })

  it('always orders the parameters the same way', () => {
    const full = state({
      subcategory: 'boutique-hotels',
      governorate: 'mount-lebanon',
      district: 'keserwan',
      priceRange: '4',
      amenities: ['pool'],
    })

    expect(filterHref(base, full, {})).toBe(
      '/stay?filter=boutique-hotels&where=mount-lebanon&district=keserwan&price=4&has=pool',
    )
  })

  it('clears back to the bare path when every facet goes', () => {
    const full = state({ subcategory: 'x', governorate: 'y', amenities: ['pool'] })
    expect(
      filterHref(base, full, {
        subcategory: undefined,
        governorate: undefined,
        amenities: [],
      }),
    ).toBe('/stay')
  })

  it('works for any section', () => {
    expect(filterHref('/weddings', empty, { subcategory: 'photographers' })).toBe(
      '/weddings?filter=photographers',
    )
  })
})
