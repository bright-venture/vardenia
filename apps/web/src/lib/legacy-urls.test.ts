import { describe, expect, it } from 'vitest'
import { legacyCategoryRedirect } from './legacy-urls'

/**
 * The test that matters here is the one about listing pages.
 *
 * `/directory/le-gray-beirut` is an address that may already be printed in a
 * magazine, and a pattern one character too loose would redirect it to a
 * category listing for as long as the issue is in circulation. Everything else
 * in this file is ordinary; that one is the reason it exists.
 */

const run = (url: string) => {
  const parsed = new URL(url, 'https://vardenia.com')
  return legacyCategoryRedirect(parsed.pathname, parsed.searchParams)
}

describe('legacyCategoryRedirect', () => {
  it('sends the old category URL to its section', () => {
    expect(run('/directory?category=hospitality')).toBe('/stay')
    expect(run('/directory?category=food-and-beverage')).toBe('/eat-and-drink')
    expect(run('/directory?category=weddings')).toBe('/weddings')
  })

  it('keeps the reader in their language', () => {
    expect(run('/ar/directory?category=hospitality')).toBe('/ar/stay')
    expect(run('/ar/directory?category=healthcare')).toBe('/ar/health')
  })

  it('carries the page number across', () => {
    expect(run('/directory?category=hospitality&page=3')).toBe('/stay?page=3')
    expect(run('/ar/directory?category=tourism&page=2')).toBe('/ar/experiences?page=2')
  })

  /**
   * The directory takes the same place, price and feature filters the sections
   * do, so an old link can carry a genuinely narrowed view. Redirecting to a
   * broader list than the one somebody shared is worse than failing: it looks
   * like it worked.
   */
  it('keeps the other filters', () => {
    expect(run('/directory?category=hospitality&where=beirut')).toBe('/stay?where=beirut')
    expect(run('/directory?category=hospitality&price=4&has=pool,spa')).toBe(
      '/stay?price=4&has=pool,spa',
    )
    expect(run('/directory?category=weddings&where=mount-lebanon&district=keserwan&page=2')).toBe(
      '/weddings?where=mount-lebanon&district=keserwan&page=2',
    )
  })

  it('tolerates a trailing slash', () => {
    expect(run('/directory/?category=hospitality')).toBe('/stay')
  })

  /**
   * The one that would be expensive. A listing address goes in the magazine as
   * readable text, so it has to resolve to the listing for as long as the issue
   * exists - whatever query string happens to be stuck on the end of it.
   */
  it('never touches a listing page', () => {
    expect(run('/directory/le-gray-beirut')).toBeNull()
    expect(run('/directory/le-gray-beirut?category=hospitality')).toBeNull()
    expect(run('/ar/directory/burger-king?category=food-and-beverage')).toBeNull()
  })

  it.each([
    ['the directory with no category', '/directory'],
    ['a category that does not exist', '/directory?category=nonsense'],
    ['an empty category', '/directory?category='],
    ['a section page, which is already right', '/stay?filter=boutique-hotels'],
    ['the magazine', '/magazine?category=hospitality'],
    ['a path that merely starts the same way', '/directory-archive?category=hospitality'],
  ])('leaves %s alone', (_name, url) => {
    expect(run(url)).toBeNull()
  })
})
