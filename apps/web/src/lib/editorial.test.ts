import { describe, expect, it } from 'vitest'
import { kindLabel, printCredit } from './editorial'

/**
 * Print provenance is what lets a reader who scanned a code in the magazine
 * confirm they are looking at the right story. It had no tests.
 */

const issue = { issueNumber: 1, title: 'Summer 2026' }

describe('printCredit', () => {
  it('reads issue, title and page range', () => {
    expect(printCredit({ issue, pageFrom: 42, pageTo: 45 }, 'en')).toBe(
      'Issue 1, Summer 2026, pages 42-45',
    )
  })

  it('says page, singular, for one page', () => {
    expect(printCredit({ issue, pageFrom: 42 }, 'en')).toBe('Issue 1, Summer 2026, page 42')
  })

  it('treats a range that starts and ends on the same page as one page', () => {
    expect(printCredit({ issue, pageFrom: 42, pageTo: 42 }, 'en')).toBe(
      'Issue 1, Summer 2026, page 42',
    )
  })

  /**
   * Arabic used the singular for every range, so a story running across four
   * pages read as though it ran across one.
   */
  it('pluralises in Arabic too', () => {
    const single = printCredit({ issue, pageFrom: 42 }, 'ar')
    const range = printCredit({ issue, pageFrom: 42, pageTo: 45 }, 'ar')

    expect(single).toContain('صفحة 42')
    expect(range).toContain('صفحات 42-45')
    expect(range).not.toContain('صفحة 42-45')
  })

  it('uses the Arabic word for issue', () => {
    expect(printCredit({ issue, pageFrom: 42 }, 'ar')).toContain('العدد 1')
  })

  it('returns null when there is no print information at all', () => {
    expect(printCredit(null, 'en')).toBeNull()
    expect(printCredit(undefined, 'en')).toBeNull()
    expect(printCredit({}, 'en')).toBeNull()
  })

  /**
   * At depth 0 a relationship is just an id. Building "Issue [object Object]"
   * or "Issue 7" out of a database id would be worse than saying nothing.
   */
  it('returns null when the issue is an unpopulated id', () => {
    expect(printCredit({ issue: 7, pageFrom: 42 }, 'en')).toBeNull()
  })

  it('copes with page numbers arriving as strings', () => {
    expect(printCredit({ issue, pageFrom: '42', pageTo: '45' }, 'en')).toBe(
      'Issue 1, Summer 2026, pages 42-45',
    )
  })

  it('ignores empty page values rather than printing a stray dash', () => {
    expect(printCredit({ issue, pageFrom: '', pageTo: '' }, 'en')).toBe('Issue 1, Summer 2026')
  })

  it('drops the trailing page when only pageTo is set', () => {
    expect(printCredit({ issue, pageTo: 45 }, 'en')).toBe('Issue 1, Summer 2026')
  })

  it('works from an issue with a number but no title', () => {
    expect(printCredit({ issue: { issueNumber: 3 }, pageFrom: 7 }, 'en')).toBe('Issue 3, page 7')
  })
})

describe('kindLabel', () => {
  it('translates every kind the collection offers', () => {
    for (const kind of ['feature', 'guide', 'interview', 'itinerary', 'news', 'sponsored']) {
      expect(kindLabel(kind, 'en')).not.toBe(kind)
      expect(kindLabel(kind, 'ar')).not.toBe(kind)
    }
  })

  /** The label is a legal requirement, not a style choice. */
  it('labels sponsored content as a paid partnership', () => {
    expect(kindLabel('sponsored', 'en')).toBe('Paid partnership')
  })

  it('falls back to the raw value so a data problem is visible', () => {
    expect(kindLabel('made-up', 'en')).toBe('made-up')
  })

  it('returns an empty string for nothing', () => {
    expect(kindLabel(null, 'en')).toBe('')
    expect(kindLabel(undefined, 'en')).toBe('')
  })
})
