import { describe, expect, it } from 'vitest'
import { placeSubmissionSchema } from './place-submission'

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

  it('only allows http and https websites', () => {
    expect(parse({ website: 'javascript:alert(1)' }).success).toBe(false)
    expect(parse({ website: 'https://example.com' }).success).toBe(true)
  })

  describe('blank optional fields', () => {
    it('treats a blank website as absent', () => {
      for (const website of ['', '   ']) {
        const r = parse({ website })
        expect(r.success).toBe(true)
        if (r.success) expect(r.data.website).toBeUndefined()
      }
    })

    it('treats blank times on a closed day as absent', () => {
      const r = parse({ openingHours: [{ day: 'mon', opens: '', closes: ' ', closed: true }] })
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.data.openingHours?.[0]?.opens).toBeUndefined()
        expect(r.data.openingHours?.[0]?.closes).toBeUndefined()
      }
    })

    it('treats blank or null area as absent and keeps a real one', () => {
      for (const area of ['', null]) {
        const r = parse({ area })
        expect(r.success).toBe(true)
        if (r.success) expect(r.data.area).toBeUndefined()
      }
      const r = parse({ area: 3 })
      expect(r.success && r.data.area).toBe(3)
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
      expect(parse({ website: 'ftp://x' }).success).toBe(false)
      expect(parse({ openingHours: [{ day: 'mon', opens: '9am', closed: false }] }).success).toBe(
        false,
      )
    })
  })
})
