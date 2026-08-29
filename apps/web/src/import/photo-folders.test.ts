import { describe, expect, it } from 'vitest'
import { planFolders } from './photo-folders'
import { toListings } from './listing-row'

/**
 * The folders photographs are collected into.
 *
 * # The only property that matters
 *
 * A folder name has to equal the slug the listing importer will mint for the
 * same row, because that is the entire link between a photograph and the
 * listing it belongs to. Everything else here is in service of that.
 *
 * So the central test does not check the folder against a string somebody typed
 * in this file. It runs the real importer over the same rows and compares. A
 * hand-written expectation would only record what the author believed the slug
 * rule was - and the first version of planFolders reimplemented that rule and
 * got it wrong three separate ways, every one of which a hand-written
 * expectation would have agreed with.
 */

/** The columns the importer needs to map a row at all. */
const listingRow = (name: string) => ({
  'Name / Listing': name,
  Category: 'Restaurants',
  District: 'Keserwan District',
  Location: '',
  'Type / Activity': '',
  'Hotel Stars': '',
  'Price Range': '',
  'Rating / 5': '',
  'Usually When': '',
  'Overview / Description': '',
})

describe('folder names against the real importer', () => {
  /**
   * Names chosen for the ways they can diverge: a repeat, a name that already
   * looks like a numbered one, punctuation the two rules treat differently, and
   * accents.
   */
  const NAMES = [
    'Chez Sami',
    'Chez Sami 2',
    'Chez Sami',
    'Café Résumé',
    'B.B. Grill',
    'Al Mandaloun',
    'Chez Sami',
  ]

  it('gives every listing the folder its slug will be', () => {
    const rows = NAMES.map(listingRow)
    const { listings } = toListings(rows)
    const { plans } = planFolders(rows)

    expect(plans).toHaveLength(listings.length)

    for (const [index, listing] of listings.entries()) {
      expect(plans[index]?.folder, `row ${index}: ${listing.name}`).toBe(listing.slug)
    }
  })

  /**
   * The collision the counting version produced. "Chez Sami 2" takes
   * `chez-sami-2` as its own slug, so the second "Chez Sami" must not be given
   * it as well.
   */
  it('never hands two businesses the same folder', () => {
    const { plans } = planFolders(NAMES.map(listingRow))
    const folders = plans.map((plan) => plan.folder)

    expect(new Set(folders).size, folders.join(', ')).toBe(folders.length)
  })

  it('numbers a repeat by probing past names already taken', () => {
    const { plans } = planFolders(NAMES.map(listingRow))

    expect(plans.map((p) => p.folder).slice(0, 3)).toEqual([
      'chez-sami',
      'chez-sami-2',
      'chez-sami-3',
    ])
  })

  /** Accents fold rather than the word being dropped. */
  it('handles a name the Latin rule has to normalise', () => {
    const { plans } = planFolders([listingRow('Café Résumé')])
    expect(plans[0]?.folder).toBe('cafe-resume')
  })

  /**
   * Arabic falls through to transliteration rather than producing nothing.
   * A row skipped here is a business whose photographs have nowhere to go.
   */
  it('does not skip a name written in Arabic', () => {
    const { plans, skipped } = planFolders([listingRow('مطعم البحر')])

    expect(skipped).toBe(0)
    expect(plans[0]?.folder).toBeTruthy()
    expect(plans[0]?.folder).toMatch(/^[a-z0-9-]+$/)
  })
})

describe('rows that cannot become a folder', () => {
  it('skips a row with no name rather than making one called nothing', () => {
    const { plans, skipped } = planFolders([
      listingRow(''),
      listingRow('   '),
      listingRow('Real Place'),
    ])

    expect(skipped).toBe(2)
    expect(plans).toHaveLength(1)
    expect(plans[0]?.folder).toBe('real-place')
  })

  /** A name of pure punctuation slugifies to nothing and has to be reported. */
  it('skips a name that leaves nothing usable', () => {
    const { skipped } = planFolders([listingRow('...')])
    expect(skipped).toBe(1)
  })
})

describe('what the run reports back', () => {
  it('names every business that appears more than once', () => {
    const { repeated } = planFolders(['Chez Sami', 'Chez Sami', 'Beit el Qamar'].map(listingRow))

    expect(repeated).toEqual([{ base: 'chez-sami', count: 2 }])
  })

  it('says nothing when every business is distinct', () => {
    const { repeated } = planFolders(['One Place', 'Another Place'].map(listingRow))
    expect(repeated).toEqual([])
  })
})
