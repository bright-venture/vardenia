import { describe, expect, it } from 'vitest'
import { TAXONOMY } from './taxonomy'
import { SECTIONS, SECTION_PATHS, sectionForCategory, sectionForPath } from './sections'

/**
 * The bug this file exists to prevent: a category that can be sold to, stamped
 * onto a printed QR code, and reachable from nowhere on the site.
 *
 * TypeScript already refuses to compile a missing section, because the mapping
 * is a `Record<CategorySlug, ...>`. These tests cover what the type cannot: that
 * the paths are unique, that nothing extra crept in, and that an unknown path is
 * rejected rather than quietly served.
 */

describe('SECTIONS', () => {
  it('gives every category in the taxonomy a home', () => {
    const covered = SECTIONS.map((section) => section.category).sort()
    const all = TAXONOMY.map((category) => category.slug).sort()

    expect(covered).toEqual(all)
  })

  it('has no section for a category that does not exist', () => {
    const slugs = new Set<string>(TAXONOMY.map((category) => category.slug))
    for (const section of SECTIONS) {
      expect(slugs.has(section.category)).toBe(true)
    }
  })

  it('gives each category exactly one section', () => {
    const categories = SECTIONS.map((section) => section.category)
    expect(new Set(categories).size).toBe(categories.length)
  })

  /** Two sections on one path would make one of them permanently unreachable. */
  it('gives each section its own path', () => {
    expect(new Set(SECTION_PATHS).size).toBe(SECTION_PATHS.length)
  })

  it('uses paths that are safe in a URL and in print', () => {
    for (const path of SECTION_PATHS) {
      expect(path).toMatch(/^[a-z][a-z-]*[a-z]$/)
    }
  })

  /**
   * The route is a top-level dynamic segment, so a section path must never
   * collide with a page that already exists or it would shadow it.
   */
  it('does not collide with the top-level pages already on the site', () => {
    const taken = [
      'account',
      'directory',
      'legal',
      'magazine',
      'partner',
      'scan',
      'api',
      'admin',
      'auth',
      'booking',
      'g',
      'qr',
      'reports',
      'media',
    ]

    for (const path of SECTION_PATHS) {
      expect(taken).not.toContain(path)
    }
  })

  it('labels every section in both languages', () => {
    for (const section of SECTIONS) {
      expect(section.en.trim().length).toBeGreaterThan(0)
      expect(section.ar.trim().length).toBeGreaterThan(0)
      // An Arabic label that is still the English one is a missed translation.
      expect(section.ar).not.toBe(section.en)
    }
  })
})

describe('sectionForCategory', () => {
  it('finds the section a listing belongs in', () => {
    expect(sectionForCategory('hospitality')?.path).toBe('stay')
    expect(sectionForCategory('weddings')?.path).toBe('weddings')
  })

  it.each([[null], [undefined], [''], ['nonsense']])('returns null for %j', (value) => {
    expect(sectionForCategory(value)).toBeNull()
  })
})

describe('sectionForPath', () => {
  it('resolves a known path to its category', () => {
    expect(sectionForPath('stay')?.category).toBe('hospitality')
    expect(sectionForPath('eat-and-drink')?.category).toBe('food-and-beverage')
    expect(sectionForPath('getting-around')?.category).toBe('transportation')
  })

  /**
   * This is what turns a mistyped URL into a 404. Without it the route would
   * render an empty listing page for any one-segment path on the site.
   */
  it.each([[null], [undefined], [''], ['stayy'], ['Stay'], ['hospitality']])(
    'returns null for %j',
    (value) => {
      expect(sectionForPath(value)).toBeNull()
    },
  )

  it('round-trips every section', () => {
    for (const section of SECTIONS) {
      expect(sectionForPath(section.path)).toEqual(section)
      expect(sectionForCategory(section.category)).toEqual(section)
    }
  })
})

/**
 * The menu shows all seven at once with a line each, so a description that is
 * missing or still in English is visible on the busiest page of the site.
 */
describe('section descriptions', () => {
  it('describes every section in both languages', () => {
    for (const section of SECTIONS) {
      expect(section.descriptionEn.trim().length, section.path).toBeGreaterThan(10)
      expect(section.descriptionAr.trim().length, section.path).toBeGreaterThan(10)
      expect(section.descriptionAr, section.path).not.toBe(section.descriptionEn)
    }
  })

  it('does not just repeat the section name', () => {
    for (const section of SECTIONS) {
      expect(section.descriptionEn.toLowerCase()).not.toBe(section.en.toLowerCase())
    }
  })
})
