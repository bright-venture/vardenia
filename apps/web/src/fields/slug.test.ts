import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('handles ordinary Latin names', () => {
    expect(slugify('Le Royal Hotel')).toBe('le-royal-hotel')
  })

  it('folds accents rather than dropping the letter', () => {
    expect(slugify('Byblos Café')).toBe('byblos-cafe')
    expect(slugify('Café 33')).toBe('cafe-33')
  })

  it('strips punctuation without leaving separators behind', () => {
    expect(slugify('Hotel #1 & Spa')).toBe('hotel-1-spa')
    expect(slugify('  --Beirut--  ')).toBe('beirut')
  })

  /**
   * The bug this file exists for. Every Arabic character was stripped, the slug
   * came out empty, and a required field then failed validation with a message
   * that never mentioned the cause.
   */
  describe('Arabic', () => {
    it('produces a usable slug instead of an empty string', () => {
      expect(slugify('مطعم بيروت')).not.toBe('')
      expect(slugify('فندق لو رويال')).not.toBe('')
    })

    it('emits only URL-safe characters', () => {
      for (const name of ['مطعم بيروت', 'فندق لو رويال', 'شركة الأرز', 'مقهى الصنائع']) {
        expect(slugify(name)).toMatch(/^[a-z0-9-]+$/)
      }
    })

    it('is stable across calls, because a slug is a printed destination', () => {
      expect(slugify('مطعم بيروت')).toBe(slugify('مطعم بيروت'))
    })

    it('drops harakat so the same word vowelled and unvowelled agree', () => {
      expect(slugify('مَطْعَم')).toBe(slugify('مطعم'))
    })

    it('converts Arabic-Indic digits', () => {
      expect(slugify('فندق ٢٠٢٦')).toContain('2026')
    })

    it('does not collapse two different names into one slug', () => {
      expect(slugify('مطعم بيروت')).not.toBe(slugify('فندق لو رويال'))
    })
  })

  it('handles mixed Arabic and Latin', () => {
    expect(slugify('Le Royal فندق')).toMatch(/^[a-z0-9-]+$/)
    expect(slugify('Le Royal فندق')).toContain('le-royal')
  })

  it('returns empty for input with nothing transliterable, so the caller can fall back', () => {
    expect(slugify('   ')).toBe('')
    expect(slugify('!!!')).toBe('')
  })
})
