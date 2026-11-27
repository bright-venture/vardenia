import { describe, expect, it } from 'vitest'
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  PAGE_HEIGHT,
  PAGE_RATIO,
  TAGLINE_MAX,
  clampText,
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

describe('layout budget (cqw)', () => {
  it('derives the page height from the ratio', () => {
    expect(PAGE_HEIGHT).toBeCloseTo(141.43, 1)
  })
})
