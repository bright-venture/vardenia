import { describe, expect, it } from 'vitest'
import { CATEGORY_SLUGS, GOVERNORATES, SUBCATEGORY_PARENT } from '@vardenia/core'
import { parseCsvTable } from '../lib/csv-parse'
import { SAMPLE_CSV, SAMPLE_ROWS } from './sample-listings'
import {
  cleanName,
  cleanNameWithNote,
  parseRating,
  priceBand,
  seasonalityFrom,
  tagsFrom,
  toListings,
} from './listing-row'

/**
 * The mapping, over a whole export rather than over chosen examples.
 *
 * # Why the fixture is hand-written
 *
 * It was the real 308-row Keserwan export, which is business data and does not
 * belong in a repository. `sample-listings.ts` replaces it with twenty rows
 * carrying every quirk that file turned out to have, each one labelled with the
 * defect it reproduces.
 *
 * The real file is still mapped locally when it is present, by
 * .unlazy/checks/import-real-file.mjs - a check rather than a test, precisely
 * because CI cannot have the file.
 *
 * # Why so many assertions are about the collection rather than the value
 *
 * A mapping mistake is silent. A row that lands in the wrong category still
 * saves, still gets a QR code and still prints. So most of these ask "would the
 * Businesses collection accept this", which is the question that has a wrong
 * answer nobody would notice.
 */

const rows = parseCsvTable(SAMPLE_CSV).rows
const { listings, skipped } = toListings(rows)

const byName = (needle: string) =>
  listings.find((listing) => listing.name.toLowerCase().includes(needle.toLowerCase()))

describe('the whole file', () => {
  it('maps every row, skipping none', () => {
    expect(skipped, JSON.stringify(skipped)).toHaveLength(0)
    expect(listings).toHaveLength(SAMPLE_ROWS)
  })

  it('gives every listing a name and a slug', () => {
    for (const listing of listings) {
      expect(listing.name, listing.sourceId).toBeTruthy()
      expect(listing.slug, listing.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    }
  })

  /** The unique column would fail the import partway through otherwise. */
  it('never produces the same slug twice', () => {
    const slugs = listings.map((listing) => listing.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('only ever uses a category the taxonomy has', () => {
    for (const listing of listings) {
      expect(CATEGORY_SLUGS, listing.name).toContain(listing.category)
    }
  })

  /**
   * The one that catches a subcategory filed under the wrong parent, which is
   * invisible in the admin panel and shows up as a listing missing from its own
   * section's filters.
   */
  it('only uses subcategories that belong to the listing own category', () => {
    for (const listing of listings) {
      for (const sub of listing.subcategories) {
        expect(SUBCATEGORY_PARENT[sub], `${listing.name}: ${sub}`).toBe(listing.category)
      }
    }
  })

  it('only ever uses a district that exists, under the right governorate', () => {
    const mountLebanon = GOVERNORATES.find((g) => g.slug === 'mount-lebanon')
    const districts = new Set(mountLebanon?.districts.map((d) => d.slug))

    for (const listing of listings) {
      expect(listing.governorate).toBe('mount-lebanon')
      if (listing.district) expect(districts, listing.name).toContain(listing.district)
    }
  })

  it('keeps every tagline inside the field limit', () => {
    for (const listing of listings) {
      if (listing.tagline) expect(listing.tagline.length, listing.name).toBeLessThanOrEqual(120)
    }
  })

  it('only ever uses a price band the field offers', () => {
    for (const listing of listings) {
      if (listing.priceRange) expect(['1', '2', '3', '4']).toContain(listing.priceRange)
    }
  })

  it('keeps every rating within range', () => {
    for (const listing of listings) {
      if (listing.googleRating !== null) {
        expect(listing.googleRating).toBeGreaterThanOrEqual(0)
        expect(listing.googleRating).toBeLessThanOrEqual(5)
      }
    }
  })

  it('only ever uses a season the field offers', () => {
    for (const listing of listings) {
      for (const season of listing.seasonality) {
        expect(['year-round', 'summer', 'winter'], listing.name).toContain(season)
      }
    }
  })

  /**
   * The import fills only fields the collection already had. Nothing in the
   * spreadsheet gets a new column invented for it, which is the rule that keeps
   * an import from dictating the shape of the product.
   */
  it('produces no field the collection does not already have', () => {
    const allowed = new Set([
      'sourceId',
      'name',
      'slug',
      'category',
      'subcategories',
      'governorate',
      'district',
      'address',
      'googleRating',
      'priceRange',
      'tagline',
      'description',
      'tags',
      'seasonality',
      'warnings',
    ])

    for (const key of Object.keys(listings[0]!)) {
      expect(allowed, `${key} is not a field the site has`).toContain(key)
    }
  })

  /** Contact details are deliberately not imported. */
  it('carries no phone number or social handle', () => {
    const serialised = JSON.stringify(listings)
    expect(serialised).not.toMatch(/\+961/)
    expect(serialised).not.toContain('@sampleguide')
  })

  it('warns about the rows a person should look at, and not about the rest', () => {
    const warned = listings.filter((listing) => listing.warnings.length > 0)
    expect(warned.length).toBeGreaterThan(0)
    expect(warned.length).toBeLessThan(listings.length / 2)
  })
})

describe('the rows that need a person', () => {
  it('flags a listing that spans two districts and files it under Keserwan', () => {
    const listing = byName('Seaview Halat')
    expect(listing?.district).toBe('keserwan')
    expect(listing?.warnings.join(' ')).toContain('spans two districts')
  })

  it('flags a listing with no district and leaves it blank', () => {
    const listing = byName('Guide With No District')
    expect(listing?.district).toBeNull()
    expect(listing?.warnings.join(' ')).toContain('no district given')
  })

  it('flags the second use of a name and suffixes its slug', () => {
    const both = listings.filter((listing) => listing.name === 'Blue Table')
    expect(both).toHaveLength(2)
    expect(both[0]?.slug).toBe('blue-table')
    expect(both[1]?.slug).toBe('blue-table-2')
    expect(both[1]?.warnings.join(' ')).toContain('was taken')
  })

  /** The field has no autumn, so the value is dropped rather than rounded. */
  it('flags a season the site cannot express', () => {
    const listing = byName('Autumn Harvest')
    expect(listing?.seasonality).toEqual([])
    expect(listing?.warnings.join(' ')).toContain('not a season the site offers')
  })
})

describe('cleanName', () => {
  it('strips a star rating and the star count in brackets', () => {
    expect(cleanName('Highridge Mountain Lodge ★★★★★ (5-star hotel)')).toBe(
      'Highridge Mountain Lodge',
    )
  })

  it('drops a trailing location that repeats the location column', () => {
    expect(cleanName('STONEHOUSE FAQRA — Faqra, Kfardebian', 'Faqra, Kfardebian')).toBe(
      'STONEHOUSE FAQRA',
    )
    expect(cleanName('Pinegrove Chalets — Faraya', 'Faraya')).toBe('Pinegrove Chalets')
  })

  /**
   * The mistake the location check exists to avoid. This is the business's real
   * name, and an unconditional "strip everything after a dash" would halve it.
   */
  it('keeps a dashed phrase that is part of the name', () => {
    expect(cleanName('Casa Marina Guesthouse - Hosting Lebanon', 'Jounieh')).toBe(
      'Casa Marina Guesthouse - Hosting Lebanon',
    )
  })

  it('keeps a hyphenated place that is genuinely the name', () => {
    expect(cleanName('Harbour Stories-Zouk Mosbeh', 'ZOUK')).toBe('Harbour Stories-Zouk Mosbeh')
  })

  /**
   * The source contradicting itself. Stripping here would file the listing in
   * the town its own name denies, on a page a printed code points at.
   */
  it('keeps a trailing place the location column disagrees with, and says so', () => {
    const result = cleanNameWithNote('Seaview Halat – Halat ★★★★☆ (4-star hotel)', 'Kaslik')

    expect(result.name).toBe('Seaview Halat – Halat')
    expect(result.disagreement).toContain('Halat')
    expect(result.disagreement).toContain('Kaslik')
  })

  it('does not call a matching location a disagreement', () => {
    expect(cleanNameWithNote('Pinegrove Chalets — Faraya', 'Faraya').disagreement).toBeNull()
  })

  it('collapses the whitespace a stripped star leaves behind', () => {
    expect(cleanName('Highridge Mountain Lodge ★★★★★')).toBe('Highridge Mountain Lodge')
  })
})

describe('tagsFrom', () => {
  it('splits a cell that is already a list', () => {
    expect(tagsFrom('Bowling, billiards, darts & games')).toEqual([
      'Bowling',
      'billiards',
      'darts',
      'games',
    ])
  })

  it('leaves a single activity whole', () => {
    expect(tagsFrom('Cable-car ride')).toEqual(['Cable-car ride'])
  })

  it('splits on a slash, which is how guides are written', () => {
    expect(tagsFrom('Private Tour / Adventure Guide')).toEqual(['Private Tour', 'Adventure Guide'])
  })

  it('drops a trailing full stop', () => {
    expect(tagsFrom('Outdoor paintball games.')).toEqual(['Outdoor paintball games'])
  })

  it('does not repeat a tag that appears twice in different case', () => {
    expect(tagsFrom('Hiking & hiking')).toEqual(['Hiking'])
  })

  it('is empty for an empty cell', () => {
    expect(tagsFrom('')).toEqual([])
  })
})

describe('seasonalityFrom', () => {
  it('reads months as a season', () => {
    expect(seasonalityFrom('July–August')).toEqual(['summer'])
    expect(seasonalityFrom('August 14–15')).toEqual(['summer'])
    expect(seasonalityFrom('Summer, commonly July–August')).toEqual(['summer'])
  })

  it('reads winter', () => {
    expect(seasonalityFrom('Winter')).toEqual(['winter'])
  })

  it('reads year round', () => {
    expect(seasonalityFrom('Year-round')).toEqual(['year-round'])
    expect(seasonalityFrom('all year')).toEqual(['year-round'])
  })

  /**
   * The field offers year-round, summer and winter and nothing else. An autumn
   * festival labelled summer is a wrong answer on a page; no label is merely an
   * incomplete one.
   */
  it('gives nothing for a season the field cannot express', () => {
    expect(seasonalityFrom('September–October')).toEqual([])
  })

  it('is empty for an empty cell', () => {
    expect(seasonalityFrom('')).toEqual([])
  })
})

describe('priceBand', () => {
  it('bands on the lower bound of a range', () => {
    expect(priceBand('$240 - $400')).toBe('3')
    expect(priceBand('$120 - $300+')).toBe('2')
    expect(priceBand('Approximately $750+')).toBe('4')
    expect(priceBand('$30')).toBe('1')
  })

  it('handles a thousands separator', () => {
    expect(priceBand('$1,200+')).toBe('4')
  })

  it('is null when there is no figure', () => {
    expect(priceBand('')).toBeNull()
    expect(priceBand('varies')).toBeNull()
  })
})

describe('parseRating', () => {
  it('reads the number out of the sheet own phrasing', () => {
    expect(parseRating('Rating: 4.6/5')).toBe(4.6)
    expect(parseRating('4.4 / 5')).toBe(4.4)
  })

  it('is null for anything out of range or absent', () => {
    expect(parseRating('')).toBeNull()
    expect(parseRating('9.1')).toBeNull()
  })
})
