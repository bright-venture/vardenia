import { describe, expect, it } from 'vitest'
import { placeSubmissionSchema } from './place-submission'
import { GOVERNORATES } from './regions'
import { LISTING_GOVERNORATES } from './listing-numbers'
import { SUBMITTABLE_KIND_SLUGS, categoryOfKind, submittableKindsByCategory } from './taxonomy'

const valid = {
  name: 'Cafe Example',
  kind: 'cafes',
  governorate: 'beirut',
  city: 'beirut',
  address: 'Hamra Street, Beirut',
  ownerName: 'Sami',
  ownerEmail: 'sami@example.com',
  ownerPhone: '+96170000000',
  pageTemplate: 'a',
  layout: 'full-page',
  issue: 1,
  listingNumber: 12,
  locale: 'en',
}

const parse = (over: Record<string, unknown> = {}) =>
  placeSubmissionSchema.safeParse({ ...valid, ...over })

describe('placeSubmissionSchema', () => {
  it('requires a known page layout', () => {
    const without = Object.fromEntries(Object.entries(valid).filter(([k]) => k !== 'layout'))
    expect(placeSubmissionSchema.safeParse(without).success).toBe(false)
    expect(parse({ layout: 'poster' }).success).toBe(false)
    expect(parse({ layout: 'quarter-page' }).success).toBe(true)
  })

  it('parses a minimal valid object', () => {
    expect(parse().success).toBe(true)
  })

  it('strips unknown keys', () => {
    const r = parse({
      tier: 'premium',
      _status: 'published',
      payments: { cash: true, card: true, whish: true, omt: true },
      contractEndsAt: '2030-01-01',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      for (const key of ['tier', '_status', 'payments', 'contractEndsAt']) {
        expect(r.data).not.toHaveProperty(key)
      }
    }
  })

  describe('kind', () => {
    it.each(SUBMITTABLE_KIND_SLUGS)('accepts %s', (kind) => {
      const r = parse({ kind })
      expect(r.success && r.data.kind).toBe(kind)
    })

    it('refuses an unknown, missing, empty, list or category-slug kind', () => {
      for (const kind of ['spaceport', '', ['cafes'], 'hospitality', 42, null]) {
        expect(parse({ kind }).success).toBe(false)
      }
      const without: Record<string, unknown> = { ...valid }
      delete without.kind
      expect(placeSubmissionSchema.safeParse(without).success).toBe(false)
    })

    it('offers all sixteen kinds, coming-soon ones included, every one with a category', () => {
      expect(SUBMITTABLE_KIND_SLUGS).toHaveLength(16)
      for (const soon of ['guided-tours', 'car-rental', 'event-planners']) {
        expect(SUBMITTABLE_KIND_SLUGS).toContain(soon)
      }
      for (const kind of SUBMITTABLE_KIND_SLUGS) expect(categoryOfKind(kind)).toBeDefined()
      expect(categoryOfKind('cafes')).toBe('food-and-beverage')
      expect(categoryOfKind('hotels')).toBe('hospitality')
      expect(categoryOfKind('nope')).toBeUndefined()
    })

    it('groups the submittable kinds by category, coming-soon categories included', () => {
      const groups = submittableKindsByCategory()
      const flat = groups.flatMap((g) => g.kinds.map((k) => k.slug))
      expect([...flat].sort()).toEqual([...SUBMITTABLE_KIND_SLUGS].sort())
      expect(groups.map((g) => g.category.slug)).toContain('weddings')
      expect(groups.map((g) => g.category.slug)).toContain('transportation')
    })

    it('no longer takes category or subcategories: the keys are stripped', () => {
      const r = parse({ category: 'hospitality', subcategories: ['hotels', 'getaways'] })
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.data).not.toHaveProperty('category')
        expect(r.data).not.toHaveProperty('subcategories')
        expect(r.data.kind).toBe('cafes')
      }
    })
  })

  describe('acceptsWhish', () => {
    it('defaults to false and keeps true', () => {
      const r = parse()
      expect(r.success && r.data.acceptsWhish).toBe(false)
      const t = parse({ acceptsWhish: true })
      expect(t.success && t.data.acceptsWhish).toBe(true)
    })

    it('refuses a non-boolean', () => {
      expect(parse({ acceptsWhish: 'yes' }).success).toBe(false)
    })
  })

  it('drops the removed inputs: hours, price range, amenities, payments, area, photos', () => {
    const r = parse({
      openingHours: [{ day: 'mon', opens: '9am', closes: '17:00', closed: false }],
      priceRange: 'nonsense',
      amenities: ['nonsense'],
      payments: { cash: true },
      area: 'x',
      hero: 'a.jpg',
      gallery: ['b.jpg'],
      logo: 'c.png',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      for (const key of [
        'openingHours',
        'priceRange',
        'amenities',
        'payments',
        'area',
        'hero',
        'gallery',
        'logo',
      ]) {
        expect(r.data).not.toHaveProperty(key)
      }
    }
  })

  it('city never changes whether the issue and listing number are valid', () => {
    // Every city of a governorate gives the same numbers.
    const keserwan = GOVERNORATES.find((g) => g.slug === 'keserwan')!
    for (const city of keserwan.cities) {
      const r = parse({ governorate: 'keserwan', city: city.slug })
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.data.issue).toBe(valid.issue)
        expect(r.data.listingNumber).toBe(valid.listingNumber)
      }
    }
    // A bad city fails on city alone, never on the numbers.
    const bad = parse({ city: 'tyre' })
    expect(bad.success).toBe(false)
    if (!bad.success) expect(bad.error.issues.every((i) => i.path[0] === 'city')).toBe(true)
  })

  it('rejects a city outside the governorate', () => {
    const r = parse({ city: 'tyre' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === 'city')).toBe(true)
  })

  it('accepts a city inside the governorate', () => {
    expect(parse({ city: 'beirut' }).success).toBe(true)
  })

  it('lowercases the owner email', () => {
    const r = parse({ ownerEmail: 'A@B.com' })
    expect(r.success && r.data.ownerEmail).toBe('a@b.com')
  })

  it('rejects an unknown page template', () => {
    expect(parse({ pageTemplate: 'd' }).success).toBe(false)
  })

  it('no longer accepts a website: the key is stripped', () => {
    const r = parse({ website: 'https://example.com' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).not.toHaveProperty('website')
  })

  describe('public contact', () => {
    it('accepts a phone, and refuses junk', () => {
      expect(parse({ publicPhone: '+961 1 234 567' }).success).toBe(true)
      expect(parse({ publicPhone: 'call me maybe' }).success).toBe(false)
      expect(parse({ publicPhone: '123' }).success).toBe(false)
    })

    it('turns an Instagram handle into a URL and keeps a good Facebook link', () => {
      const r = parse({ instagram: '@cafe.nour', facebook: 'https://facebook.com/cafe' })
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.data.instagram).toBe('https://instagram.com/cafe.nour')
        expect(r.data.facebook).toBe('https://facebook.com/cafe')
      }
    })

    it('refuses hostile and off-network links', () => {
      for (const instagram of [
        'javascript:alert(1)',
        'data:text/html,x',
        'http://instagram.com/a',
        'https://evil.com/a',
      ]) {
        expect(parse({ instagram }).success).toBe(false)
      }
      expect(parse({ facebook: 'cafe' }).success).toBe(false)
      expect(parse({ facebook: 'https://instagram.com/cafe' }).success).toBe(false)
    })

    it('treats blank phone and links as absent', () => {
      const r = parse({ publicPhone: ' ', instagram: '', facebook: '  ' })
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.data.publicPhone).toBeUndefined()
        expect(r.data.instagram).toBeUndefined()
        expect(r.data.facebook).toBeUndefined()
      }
    })
  })

  /**
   * Issue first (27 November 2026): the city is asked only for an issue that
   * covers one governorate, which the schema cannot see; the server requires
   * it there (core placeInIssue). An All Lebanon listing has none.
   */
  describe('city is optional', () => {
    it('every governorate a place can be in has at least one city', () => {
      for (const slug of LISTING_GOVERNORATES) {
        const gov = GOVERNORATES.find((g) => g.slug === slug)
        expect(gov?.cities.length, slug).toBeGreaterThan(0)
      }
    })

    it.each(['', '   ', null])('reads a blank city (%j) as no city', (city) => {
      const r = parse({ city })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.city).toBeUndefined()
    })

    it('accepts a missing city', () => {
      const without: Record<string, unknown> = { ...valid }
      delete without.city
      const r = placeSubmissionSchema.safeParse(without)
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.city).toBeUndefined()
    })

    it('still refuses a city that is too long', () => {
      expect(parse({ city: 'x'.repeat(65) }).success).toBe(false)
    })

    it('accepts every city of every governorate, keeping the slug', () => {
      for (const gov of GOVERNORATES) {
        for (const city of gov.cities) {
          const r = parse({ governorate: gov.slug, city: city.slug })
          expect(r.success && r.data.city).toBe(city.slug)
        }
      }
    })
  })

  describe('blank optional fields', () => {
    it('still requires required fields and rejects non-blank invalid values', () => {
      expect(parse({ name: '' }).success).toBe(false)
      expect(parse({ address: '  ' }).success).toBe(false)
      expect(parse({ instagram: 'ftp://x' }).success).toBe(false)
    })
  })
})
