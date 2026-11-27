import { describe, expect, it } from 'vitest'
import {
  DESCRIPTION_MAX,
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
  templateBBodyOverflow,
  templateBStack,
  templateCBand,
  templateCBandLimit,
} from './preview-model'

describe('clampText', () => {
  it('leaves short text alone', () => {
    expect(clampText('hello', 10)).toBe('hello')
  })

  it('cuts long text to the limit, ellipsis included', () => {
    const out = clampText('a'.repeat(5000), DESCRIPTION_MAX)
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
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
    expect([DESCRIPTION_MAX, NAME_MAX, TAGLINE_MAX]).toEqual([600, 60, 90])
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
  it('A: fails if the hero or the body clamp is made larger', () => {
    expect(templateAStack({ ...A_LAYOUT, bodyLines: 6 })).toBeGreaterThan(
      templateAAvailable({ ...A_LAYOUT, bodyLines: 6 }),
    )
    expect(templateAStack()).toBeGreaterThan(templateAAvailable({ ...A_LAYOUT, heroPct: 52 }))
  })

  it('B: the page fits, and the body fits beside its photo', () => {
    expect(templateBStack()).toBeLessThanOrEqual(PAGE_HEIGHT)
    expect(templateBBodyOverflow()).toBeLessThanOrEqual(0)
  })
  it('B: fails if the body clamp is made larger', () => {
    expect(templateBBodyOverflow({ ...B_LAYOUT, bodyLines: 13 })).toBeGreaterThan(0)
  })

  it('C: the text band stays within its share of the page', () => {
    expect(templateCBand()).toBeLessThanOrEqual(templateCBandLimit())
  })
  it('C: fails if the body clamp is made larger', () => {
    expect(templateCBand({ ...C_LAYOUT, bodyLines: 8 })).toBeGreaterThan(templateCBandLimit())
  })
})
