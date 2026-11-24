import { describe, expect, it } from 'vitest'
import { HOTEL_AND_GETAWAY_MESSAGE, placeSubmissionSchema } from './place-submission'

const valid = {
  name: 'Cafe Example',
  category: 'food-and-beverage',
  subcategories: ['cafes'],
  governorate: 'beirut',
  address: 'Hamra Street, Beirut',
  amenities: [],
  payments: { cash: true, card: false, whish: false, omt: false },
  ownerName: 'Sami',
  ownerEmail: 'sami@example.com',
  ownerPhone: '+96170000000',
  pageTemplate: 'a',
  issue: 1,
  listingNumber: 12,
  locale: 'en',
}

const parse = (over: Record<string, unknown> = {}) =>
  placeSubmissionSchema.safeParse({ ...valid, ...over })

describe('placeSubmissionSchema', () => {
  it('parses a minimal valid object', () => {
    expect(parse().success).toBe(true)
  })

  it('strips unknown keys', () => {
    const r = parse({ tier: 'premium', _status: 'published' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data).not.toHaveProperty('tier')
      expect(r.data).not.toHaveProperty('_status')
    }
  })

  it('refuses hotels and getaways together, on subcategories', () => {
    const r = parse({ category: 'hospitality', subcategories: ['hotels', 'getaways'] })
    expect(r.success).toBe(false)
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.message === HOTEL_AND_GETAWAY_MESSAGE)
      expect(issue?.path).toEqual(['subcategories'])
    }
    expect(parse({ category: 'hospitality', subcategories: ['hotels'] }).success).toBe(true)
    expect(parse({ category: 'hospitality', subcategories: ['getaways'] }).success).toBe(true)
  })

  it('rejects a subcategory of another category', () => {
    const r = parse({ subcategories: ['hotels'] })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === 'subcategories')).toBe(true)
  })

  it('rejects a district outside the governorate', () => {
    const r = parse({ district: 'tyre' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === 'district')).toBe(true)
  })

  it('accepts a district inside the governorate', () => {
    expect(parse({ district: 'beirut' }).success).toBe(true)
  })

  it('lowercases the owner email', () => {
    const r = parse({ ownerEmail: 'A@B.com' })
    expect(r.success && r.data.ownerEmail).toBe('a@b.com')
  })

  it('rejects a bad opening time and accepts 24:00 as closing', () => {
    const day = { day: 'mon', closed: false }
    expect(parse({ openingHours: [{ ...day, opens: '9am', closes: '17:00' }] }).success).toBe(false)
    expect(parse({ openingHours: [{ ...day, opens: '09:00', closes: '24:00' }] }).success).toBe(
      true,
    )
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

  describe('blank optional fields', () => {
    it('treats blank times on a closed day as absent', () => {
      const r = parse({ openingHours: [{ day: 'mon', opens: '', closes: ' ', closed: true }] })
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.data.openingHours?.[0]?.opens).toBeUndefined()
        expect(r.data.openingHours?.[0]?.closes).toBeUndefined()
      }
    })

    it('treats blank district and priceRange as absent', () => {
      const r = parse({ district: '', priceRange: '' })
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.data.district).toBeUndefined()
        expect(r.data.priceRange).toBeUndefined()
      }
    })

    it('still requires required fields and rejects non-blank invalid values', () => {
      expect(parse({ name: '' }).success).toBe(false)
      expect(parse({ address: '  ' }).success).toBe(false)
      expect(parse({ instagram: 'ftp://x' }).success).toBe(false)
      expect(parse({ openingHours: [{ day: 'mon', opens: '9am', closed: false }] }).success).toBe(
        false,
      )
    })
  })
})
