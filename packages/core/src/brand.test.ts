import { describe, expect, it } from 'vitest'
import {
  MAX_BRANCHES_PER_BRAND,
  MAX_NEW_BRANCHES_PER_DAY,
  branchRequestSchema,
  canHaveBrand,
} from './brand'
import { PARTNER_EDITABLE_FIELDS, STAFF_ONLY_LISTING_FIELDS } from './partner-fields'

const valid = {
  sourceListingId: 12,
  name: 'Cafe Nour Jounieh',
  governorate: 'keserwan',
  district: 'jounieh',
  address: 'Main road, Jounieh',
  mapUrl: 'https://www.google.com/maps/@33.98,35.61,17z',
}

const parse = (over: Record<string, unknown> = {}) =>
  branchRequestSchema.safeParse({ ...valid, ...over })

describe('canHaveBrand', () => {
  it('is true for restaurants only', () => {
    expect(canHaveBrand(['restaurants'])).toBe(true)
    expect(canHaveBrand(['restaurants', 'bars'])).toBe(true)
    expect(canHaveBrand(['hotels'])).toBe(false)
    expect(canHaveBrand(['cafes'])).toBe(false)
    expect(canHaveBrand([])).toBe(false)
    expect(canHaveBrand(null)).toBe(false)
  })
})

describe('limits', () => {
  it('are the agreed numbers', () => {
    expect(MAX_BRANCHES_PER_BRAND).toBe(20)
    expect(MAX_NEW_BRANCHES_PER_DAY).toBe(5)
  })
})

describe('the brand stays with the team', () => {
  it('is not on the partner allow-list', () => {
    expect(PARTNER_EDITABLE_FIELDS as readonly string[]).not.toContain('brand')
    expect(STAFF_ONLY_LISTING_FIELDS as readonly string[]).toContain('brand')
  })
})

describe('branchRequestSchema', () => {
  it('parses a minimal branch with a map link', () => {
    const r = parse()
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.sourceListingId).toBe(12)
  })

  it('accepts a point instead of a link', () => {
    const r = parse({ mapUrl: undefined, location: [35.61, 33.98] })
    expect(r.success).toBe(true)
  })

  it('needs a map link or a point', () => {
    const r = parse({ mapUrl: undefined })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]!.path).toEqual(['mapUrl'])
  })

  it('refuses a link that is not Google Maps', () => {
    expect(parse({ mapUrl: 'https://sites.google.com/maps/evil' }).success).toBe(false)
    expect(parse({ mapUrl: 'https://evil.example/maps' }).success).toBe(false)
  })

  it('refuses a point out of range', () => {
    expect(parse({ mapUrl: undefined, location: [200, 10] }).success).toBe(false)
    expect(parse({ mapUrl: undefined, location: [35] }).success).toBe(false)
  })

  it('refuses a point or a link outside Lebanon (the one rule, isWithinLebanon)', () => {
    expect(parse({ mapUrl: undefined, location: [2.35, 48.85] }).success).toBe(false)
    expect(parse({ mapUrl: undefined, location: [33.98, 35.61] }).success).toBe(false)
    expect(parse({ mapUrl: 'https://www.google.com/maps/@48.85,2.35,15z' }).success).toBe(false)
  })

  it('refuses a district of another governorate', () => {
    const r = parse({ governorate: 'beirut', district: 'jounieh' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]!.path).toEqual(['district'])
  })

  it('refuses an unknown governorate', () => {
    expect(parse({ governorate: 'atlantis' }).success).toBe(false)
  })

  it('refuses unknown keys instead of stripping them', () => {
    for (const key of [
      'tier',
      'verified',
      'slug',
      '_status',
      'booking',
      'qrCode',
      'brand',
      'submission',
      'category',
    ]) {
      const r = parse({ [key]: 'x' })
      expect(r.success, key).toBe(false)
      if (!r.success) expect(r.error.issues[0]!.code, key).toBe('unrecognized_keys')
    }
  })

  it('refuses unknown keys inside contact', () => {
    expect(parse({ contact: { phone: '+961 1 234567', tier: 'gold' } }).success).toBe(false)
  })

  it('checks and normalises contact like the listing', () => {
    const r = parse({ contact: { phone: '+961 1 234567', instagram: '@cafenour', email: '' } })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.contact?.instagram).toBe('https://instagram.com/cafenour')
      expect(r.data.contact?.email).toBeUndefined()
    }
    expect(parse({ contact: { phone: 'call me' } }).success).toBe(false)
    expect(parse({ contact: { instagram: 'https://evil.example/x' } }).success).toBe(false)
  })

  it('takes opening hours in the listing shape', () => {
    const ok = parse({
      openingHours: [{ day: 'mon', opens: '09:00', closes: '23:00', closed: false }],
    })
    expect(ok.success).toBe(true)
    expect(
      parse({ openingHours: [{ day: 'mon', opens: '9am', closes: '23:00', closed: false }] })
        .success,
    ).toBe(false)
    expect(parse({ openingHours: [{ day: 'xyz', closed: true }] }).success).toBe(false)
  })

  it('needs a name and an address', () => {
    expect(parse({ name: '  ' }).success).toBe(false)
    expect(parse({ address: '' }).success).toBe(false)
  })

  it('needs a whole positive source id', () => {
    expect(parse({ sourceListingId: 'abc' }).success).toBe(false)
    expect(parse({ sourceListingId: -1 }).success).toBe(false)
    expect(parse({ sourceListingId: 1.5 }).success).toBe(false)
    expect(parse({ sourceListingId: true }).success).toBe(false)
  })
})
