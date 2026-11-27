import { describe, expect, it } from 'vitest'
import { nextPage, pageSpans, planRange, rowTitle } from './template-pages'

describe('template page numbers', () => {
  it('numbers rows in print order, a spread taking two pages', () => {
    const layouts = ['full-spread', 'full-page', 'half-page', 'full-spread', 'quarter-page']
    expect(pageSpans(layouts)).toEqual([
      { first: 1, last: 2 },
      { first: 3, last: 3 },
      { first: 4, last: 4 },
      { first: 5, last: 6 },
      { first: 7, last: 7 },
    ])
    expect(nextPage(layouts)).toBe(8)
  })

  it('counts a row with no layout as one page and starts at 1 when empty', () => {
    expect(pageSpans([null, undefined, 'unknown'])).toHaveLength(3)
    expect(nextPage([null, undefined])).toBe(3)
    expect(nextPage([])).toBe(1)
  })

  it('titles a spread "Page 1→2" and others by their page', () => {
    const layouts = ['full-spread', 'half-page', null]
    expect(rowTitle(layouts, 0)).toBe('Page 1→2 · Full spread')
    expect(rowTitle(layouts, 1)).toBe('Page 3 · Half page')
    expect(rowTitle(layouts, 2)).toBe('Page 4 · choose a layout')
  })
})

describe('planRange', () => {
  it('turns "page 1 to 10, half pages" into ten rows', () => {
    expect(planRange([], 1, 10, 'half-page')).toEqual({ ok: true, count: 10 })
  })

  it('gives a spread two pages per row', () => {
    expect(planRange([], 1, 10, 'full-spread')).toEqual({ ok: true, count: 5 })
  })

  it('refuses a spread range with an odd number of pages', () => {
    const plan = planRange([], 1, 9, 'full-spread')
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.message).toMatch(/even number of pages/)
  })

  it('must continue where the template ends', () => {
    const layouts = ['full-page', 'full-spread'] // pages 1-3
    expect(planRange(layouts, 4, 6, 'quarter-page')).toEqual({ ok: true, count: 3 })
    const gap = planRange(layouts, 6, 8, 'quarter-page')
    expect(gap.ok).toBe(false)
    if (!gap.ok) expect(gap.message).toMatch(/starts at page 4/)
    const first = planRange([], 2, 5, 'full-page')
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.message).toMatch(/starts at 1/)
  })

  it('refuses a backwards, non-whole or huge range', () => {
    expect(planRange([], 1, 0, 'full-page').ok).toBe(false)
    expect(planRange([], 1.5, 3, 'full-page').ok).toBe(false)
    expect(planRange([], 1, 5000, 'full-page').ok).toBe(false)
  })
})
