import { describe, expect, it } from 'vitest'
import {
  NAME_MAX,
  A_LAYOUT,
  B_LAYOUT,
  C_LAYOUT,
  PAGE_HEIGHT,
  PAGE_RATIO,
  TAGLINE_MAX,
  clampText,
  emptyPreview,
  pageNumberLabel,
  previewText,
  templateAAvailable,
  templateAStack,
  templateBStack,
  templateCBand,
  templateCBandLimit,
} from './preview-model'

describe('clampText', () => {
  it('leaves short text alone', () => {
    expect(clampText('hello', 10)).toBe('hello')
  })

  it('cuts long text to the limit, ellipsis included', () => {
    const out = clampText('a'.repeat(5000), NAME_MAX)
    expect(out.length).toBeLessThanOrEqual(NAME_MAX)
    expect(out.endsWith('\u2026')).toBe(true)
  })

  it('does not leave a space before the ellipsis', () => {
    expect(clampText('word word word', 6)).toBe('word\u2026')
  })

  it('does not split an Arabic or emoji character in half', () => {
    const out = clampText('\u{1F600}'.repeat(50), 10)
    expect(Array.from(out).length).toBeLessThanOrEqual(10)
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })

  it('trims surrounding whitespace', () => {
    expect(clampText('  hi  ', 10)).toBe('hi')
  })
})

describe('limits', () => {
  it('are the agreed ones', () => {
    expect([NAME_MAX, TAGLINE_MAX]).toEqual([60, 90])
    expect(PAGE_RATIO).toBe('210 / 297')
  })
})

describe('pageNumberLabel', () => {
  it('reads VARDENIA - n', () => {
    expect(pageNumberLabel(47)).toBe('VARDENIA - 47')
  })
  it('is blank when unset', () => {
    expect(pageNumberLabel(undefined)).toBe('')
  })
})

describe('previewText', () => {
  it('returns the value, or the placeholder when empty', () => {
    expect(previewText('Cafe', 'Name', 10)).toEqual({ text: 'Cafe', placeholder: false })
    expect(previewText('   ', 'Name', 10)).toEqual({ text: 'Name', placeholder: true })
    expect(previewText(undefined, 'Name', 10)).toEqual({ text: 'Name', placeholder: true })
  })
})

describe('emptyPreview', () => {
  it('has no undefined strings and carries the locale', () => {
    const e = emptyPreview('ar')
    expect(e.locale).toBe('ar')
    expect(e.name).toBe('')
    expect(e.galleryUrls).toEqual([])
    expect(e.amenities).toEqual([])
    expect(e.listingNumber).toBeUndefined()
  })
})

describe('layout budget (cqw)', () => {
  it('derives the page height from the ratio', () => {
    expect(PAGE_HEIGHT).toBeCloseTo(141.43, 1)
  })

  it('A: hero plus the text block at the clamp limits fits the page', () => {
    expect(templateAStack()).toBeLessThanOrEqual(templateAAvailable())
  })
  it('A: fails if the hero is made much larger', () => {
    expect(templateAStack()).toBeGreaterThan(templateAAvailable({ ...A_LAYOUT, heroPct: 60 }))
  })

  it('B: the page fits', () => {
    expect(templateBStack()).toBeLessThanOrEqual(PAGE_HEIGHT)
  })
  it('B: fails if the photos are made much taller', () => {
    expect(templateBStack({ ...B_LAYOUT, photoHeight: 70 })).toBeGreaterThan(PAGE_HEIGHT)
  })

  it('C: the text band stays within its share of the page', () => {
    expect(templateCBand()).toBeLessThanOrEqual(templateCBandLimit())
  })
  it('C: fails if the band is given a much smaller share', () => {
    expect(templateCBand()).toBeGreaterThan(templateCBandLimit({ ...C_LAYOUT, maxBandPct: 30 }))
  })
})
