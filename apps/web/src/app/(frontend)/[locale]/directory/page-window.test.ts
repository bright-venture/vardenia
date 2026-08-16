import { describe, expect, it } from 'vitest'
import { pageWindow } from './page'

/**
 * The directory rendered a link for every page. At 24 listings per page that is
 * 42 links for a thousand listings and 417 for ten thousand, in the HTML of
 * every directory view - a control whose usefulness is fixed while its cost
 * grows with the catalogue.
 */

describe('pageWindow', () => {
  it('renders nothing when there is only one page', () => {
    expect(pageWindow(1, 1)).toEqual([])
    expect(pageWindow(1, 0)).toEqual([])
  })

  it('lists every page while they still fit', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('always keeps the first and last reachable', () => {
    const window = pageWindow(50, 100)
    expect(window[0]).toBe(1)
    expect(window[window.length - 1]).toBe(100)
  })

  it('keeps a couple either side of where you are', () => {
    expect(pageWindow(50, 100)).toEqual([1, 'gap', 48, 49, 50, 51, 52, 'gap', 100])
  })

  it('marks the jump rather than leaving a silent leap', () => {
    expect(pageWindow(50, 100).filter((n) => n === 'gap')).toHaveLength(2)
  })

  it('does not open a gap for a single missing page', () => {
    // 1, [2], 3, 4, 5, 6 - nothing is skipped, so nothing should say it was.
    expect(pageWindow(4, 6)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('stays bounded however large the catalogue grows', () => {
    for (const total of [100, 1_000, 10_000]) {
      expect(pageWindow(Math.floor(total / 2), total).length).toBeLessThanOrEqual(9)
    }
  })

  it('handles being at either end', () => {
    expect(pageWindow(1, 100)).toEqual([1, 2, 3, 'gap', 100])
    expect(pageWindow(100, 100)).toEqual([1, 'gap', 98, 99, 100])
  })

  it('never repeats a page number', () => {
    for (const current of [1, 2, 3, 50, 98, 99, 100]) {
      const numbers = pageWindow(current, 100).filter((n): n is number => n !== 'gap')
      expect(new Set(numbers).size).toBe(numbers.length)
    }
  })

  it('stays in order', () => {
    const numbers = pageWindow(50, 100).filter((n): n is number => n !== 'gap')
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers)
  })

  /** A page number outside the range should not invent links outside it. */
  it('ignores a current page beyond the end', () => {
    const window = pageWindow(999, 10)
    expect(window.filter((n) => n !== 'gap')).toEqual([1, 10])
  })
})
