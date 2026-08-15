import { describe, expect, it } from 'vitest'
import { GOVERNORATES, LISTING_TIERS, TAXONOMY, isWithinLebanon } from '@vardenia/core'
import { ARTICLES, BUSINESSES, ISSUES, PAGES, SCAN_CITIES, SEEDED_SLUGS } from './fixtures'
import { richText } from './rich-text'

/**
 * Seed data rots quietly. A category slug that no longer exists produces a
 * listing which saves fine, renders fine, and matches no filter - you find out
 * by browsing, weeks later, and assume the filter is broken.
 *
 * Everything here is checkable without a database, so it runs in CI with the
 * rest of the suite. If someone retires a taxonomy slug, this fails immediately
 * and names the fixture holding it.
 */

// Widened to string on purpose. The fixtures hold plain strings so they do not
// depend on generated types, and the whole job here is to check those strings
// against the real taxonomy at runtime.
const categorySlugs = new Set<string>(TAXONOMY.map((c) => c.slug))
const subcategorySlugs = new Map<string, Set<string>>(
  TAXONOMY.map((c) => [c.slug as string, new Set<string>(c.children.map((s) => s.slug))]),
)
const governorateSlugs = new Set<string>(GOVERNORATES.map((g) => g.slug))
const districtSlugs = new Map<string, Set<string>>(
  GOVERNORATES.map((g) => [g.slug as string, new Set<string>(g.districts.map((d) => d.slug))]),
)

describe('business fixtures', () => {
  it.each(BUSINESSES.map((b) => [b.slug, b] as const))('%s uses a real category', (_slug, b) => {
    expect(categorySlugs.has(b.category)).toBe(true)
  })

  it.each(BUSINESSES.map((b) => [b.slug, b] as const))(
    '%s subcategories belong to its category',
    (_slug, b) => {
      const allowed = subcategorySlugs.get(b.category)
      expect(allowed).toBeDefined()
      for (const sub of b.subcategories) {
        expect(allowed!.has(sub), `${sub} is not under ${b.category}`).toBe(true)
      }
    },
  )

  it.each(BUSINESSES.map((b) => [b.slug, b] as const))(
    '%s district belongs to its governorate',
    (_slug, b) => {
      expect(governorateSlugs.has(b.governorate)).toBe(true)
      const allowed = districtSlugs.get(b.governorate)
      expect(allowed!.has(b.district), `${b.district} is not in ${b.governorate}`).toBe(true)
    },
  )

  /**
   * The Businesses collection validates this and rejects coordinates outside
   * Lebanon, usually because lat and lng were written the wrong way round. Seed
   * data that trips that validation fails halfway through with a stack trace.
   */
  it.each(BUSINESSES.map((b) => [b.slug, b] as const))(
    '%s coordinates are inside Lebanon and in [lng, lat] order',
    (_slug, b) => {
      const [lng, lat] = b.location
      expect(isWithinLebanon(lat, lng)).toBe(true)
    },
  )

  it.each(BUSINESSES.map((b) => [b.slug, b] as const))('%s has a valid tier', (_slug, b) => {
    expect(LISTING_TIERS).toContain(b.tier)
  })

  it('covers every tier, so tier-dependent rendering has an example', () => {
    const covered = new Set(BUSINESSES.map((b) => b.tier))
    for (const tier of LISTING_TIERS) {
      expect(covered.has(tier), `no fixture uses the ${tier} tier`).toBe(true)
    }
  })

  it('includes a draft, so publishedOrStaff has something to hide', () => {
    expect(BUSINESSES.some((b) => b.status === 'draft')).toBe(true)
  })

  it('includes a listing with no opening hours and one that shuts on a weekday', () => {
    expect(BUSINESSES.some((b) => b.openingHours.length === 0)).toBe(true)
    expect(BUSINESSES.some((b) => b.openingHours.some((h) => h.closed))).toBe(true)
  })

  it('gives every open day both an opening and a closing time', () => {
    for (const b of BUSINESSES) {
      for (const hour of b.openingHours) {
        if (hour.closed) continue
        expect(hour.opens, `${b.slug} ${hour.day} has no opening time`).toMatch(/^\d{2}:\d{2}$/)
        expect(hour.closes, `${b.slug} ${hour.day} has no closing time`).toMatch(/^\d{2}:\d{2}$/)
      }
    }
  })

  it('keeps commercial fields on contracted listings only', () => {
    for (const b of BUSINESSES) {
      if (b.tier === 'free') {
        expect(b.contractEndsAt, `${b.slug} is free but has a contract`).toBeUndefined()
      }
    }
  })
})

describe('article fixtures', () => {
  it('points every featured business at a real fixture', () => {
    const known = new Set(BUSINESSES.map((b) => b.slug))
    for (const article of ARTICLES) {
      for (const slug of article.featured) {
        expect(known.has(slug), `${article.slug} features unknown ${slug}`).toBe(true)
      }
    }
  })

  it('gives a sponsored article a sponsor, and no other kind one', () => {
    for (const article of ARTICLES) {
      if (article.kind === 'sponsored') {
        expect(article.sponsoredBy, `${article.slug} is sponsored by nobody`).toBeDefined()
      } else {
        expect(article.sponsoredBy).toBeUndefined()
      }
    }
  })

  it('includes a sponsored article, since it renders a mandatory label', () => {
    expect(ARTICLES.some((a) => a.kind === 'sponsored')).toBe(true)
  })

  it('uses real categories and governorates where set', () => {
    for (const a of ARTICLES) {
      if (a.category) expect(categorySlugs.has(a.category)).toBe(true)
      if (a.governorate) expect(governorateSlugs.has(a.governorate)).toBe(true)
    }
  })

  it('keeps print page ranges the right way round', () => {
    for (const a of ARTICLES) {
      if (a.pageFrom && a.pageTo) expect(a.pageTo).toBeGreaterThanOrEqual(a.pageFrom)
    }
  })

  it('stays inside the issue page count', () => {
    const issue = ISSUES[0]
    expect(issue).toBeDefined()

    for (const a of ARTICLES) {
      if (a.pageTo)
        expect(a.pageTo, `${a.slug} runs past the end of the issue`).toBeLessThanOrEqual(
          issue!.pageCount,
        )
    }
  })
})

describe('every fixture is bilingual', () => {
  it('gives businesses both languages', () => {
    for (const b of BUSINESSES) {
      for (const field of [b.name, b.tagline, b.description, b.address]) {
        expect(field.en.length).toBeGreaterThan(0)
        expect(field.ar.length).toBeGreaterThan(0)
      }
    }
  })

  it('gives articles both languages, with matching paragraph counts', () => {
    for (const a of ARTICLES) {
      expect(a.title.ar.length).toBeGreaterThan(0)
      expect(a.excerpt.ar.length).toBeGreaterThan(0)
      expect(a.body.ar.length, `${a.slug} translations do not line up`).toBe(a.body.en.length)
    }
  })

  it('writes Arabic in Arabic script, catching a copy-paste of the English', () => {
    const arabic = /[؀-ۿ]/
    for (const b of BUSINESSES) {
      expect(arabic.test(b.name.ar), `${b.slug} Arabic name is not Arabic`).toBe(true)
    }
    for (const a of ARTICLES) {
      expect(arabic.test(a.title.ar), `${a.slug} Arabic title is not Arabic`).toBe(true)
    }
  })
})

describe('slugs', () => {
  it('are unique within each collection', () => {
    for (const [collection, slugs] of Object.entries(SEEDED_SLUGS)) {
      expect(new Set(slugs).size, `duplicate slug in ${collection}`).toBe(slugs.length)
    }
  })

  it('are URL safe, since they end up in printed QR destinations', () => {
    for (const slugs of Object.values(SEEDED_SLUGS)) {
      for (const slug of slugs) {
        expect(slug, `${slug} is not a clean slug`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      }
    }
  })

  it('lists every fixture, so reset removes everything the seed creates', () => {
    expect(SEEDED_SLUGS.businesses).toHaveLength(BUSINESSES.length)
    expect(SEEDED_SLUGS.articles).toHaveLength(ARTICLES.length)
    expect(SEEDED_SLUGS.issues).toHaveLength(ISSUES.length)
    expect(SEEDED_SLUGS.pages).toHaveLength(PAGES.length)
  })
})

describe('scan cities', () => {
  it('has positive weights and ISO country codes', () => {
    for (const city of SCAN_CITIES) {
      expect(city.weight).toBeGreaterThan(0)
      expect(city.country).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('includes traffic from outside Lebanon, which is the point of the magazine', () => {
    expect(SCAN_CITIES.some((c) => c.country !== 'LB')).toBe(true)
  })
})

describe('richText', () => {
  it('builds one paragraph per string', () => {
    const doc = richText(['one', 'two'])
    expect(doc.root.children).toHaveLength(2)
    expect(doc.root.children[0]?.children[0]?.text).toBe('one')
    expect(doc.root.children[1]?.children[0]?.text).toBe('two')
  })

  it('produces the root shape Lexical requires', () => {
    const doc = richText(['hello'])
    expect(doc.root.type).toBe('root')
    expect(doc.root.version).toBe(1)
    expect(doc.root.direction).toBe('ltr')
  })

  it('handles an empty document without crashing', () => {
    expect(richText([]).root.children).toHaveLength(0)
  })
})
