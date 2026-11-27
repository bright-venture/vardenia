import { describe, expect, it } from 'vitest'
import type { Slot } from './page-layouts'
import {
  buildMagazinePages,
  regionOfPage,
  spreadIndexOfPage,
  toSpreads,
  type MagazinePage,
} from './magazine-view'

const slot = (
  number: number,
  page: number,
  layout: Slot['layout'],
  position: number | null = null,
): Slot => ({
  number,
  page,
  position,
  layout,
})

const pagesOf = (spreads: MagazinePage[][]) => spreads.map((s) => s.map((p) => p.page))

describe('buildMagazinePages', () => {
  it('gives every page 1..pageCount exactly once', () => {
    const pages = buildMagazinePages([slot(1, 2, 'full-page')], 4, {})
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3, 4])
  })

  it('makes a page with no slot editorial with its note, or null', () => {
    const pages = buildMagazinePages([slot(1, 2, 'full-page')], 3, { 1: 'Cover' })
    expect(pages[0]).toEqual({ page: 1, kind: 'editorial', note: 'Cover' })
    expect(pages[2]).toEqual({ page: 3, kind: 'editorial', note: null })
    expect(pages[1]).toMatchObject({ kind: 'listings', layout: 'full-page', span: 1 })
  })

  it('treats an empty note as no note', () => {
    expect(buildMagazinePages([], 1, { 1: '' })[0]).toEqual({
      page: 1,
      kind: 'editorial',
      note: null,
    })
  })

  it('groups the slots of one page, ordered by position', () => {
    const pages = buildMagazinePages(
      [slot(3, 2, 'half-page', 2), slot(2, 2, 'half-page', 1)],
      2,
      {},
    )
    expect(pages[1]).toEqual({
      page: 2,
      kind: 'listings',
      layout: 'half-page',
      span: 1,
      slots: [
        { number: 2, position: 1 },
        { number: 3, position: 2 },
      ],
    })
  })

  it('makes a full spread one entry at its left page, with no entry for its second page', () => {
    const pages = buildMagazinePages([slot(1, 2, 'full-spread')], 4, {})
    expect(pages.map((p) => p.page)).toEqual([1, 2, 4])
    expect(pages[1]).toEqual({
      page: 2,
      kind: 'listings',
      layout: 'full-spread',
      span: 2,
      slots: [{ number: 1, position: null }],
    })
  })
})

describe('toSpreads', () => {
  const ed = (page: number): MagazinePage => ({ page, kind: 'editorial', note: null })
  const spread = (page: number): MagazinePage => ({
    page,
    kind: 'listings',
    layout: 'full-spread',
    span: 2,
    slots: [{ number: page, position: null }],
  })

  it('shows page 1 alone, then 2-3, 4-5', () => {
    expect(pagesOf(toSpreads([1, 2, 3, 4, 5].map(ed)))).toEqual([[1], [2, 3], [4, 5]])
  })

  it('keeps a spread entry alone on the spread of its left page', () => {
    expect(pagesOf(toSpreads([ed(1), spread(2), ed(4), ed(5)]))).toEqual([[1], [2], [4, 5]])
  })

  it('leaves a trailing odd page alone', () => {
    expect(pagesOf(toSpreads([1, 2, 3, 4].map(ed)))).toEqual([[1], [2, 3], [4]])
  })

  it('does not pair across a missing page', () => {
    expect(pagesOf(toSpreads([ed(1), ed(3), ed(4)]))).toEqual([[1], [3], [4]])
  })

  it('is empty for no pages', () => {
    expect(toSpreads([])).toEqual([])
  })
})

describe('regionOfPage', () => {
  const regions = [
    { governorate: 'beirut', firstPage: 4, lastPage: 9 },
    { governorate: 'matn', firstPage: 10, lastPage: 20 },
  ]
  it('finds the block containing the page', () => {
    expect(regionOfPage(regions, 4)?.governorate).toBe('beirut')
    expect(regionOfPage(regions, 9)?.governorate).toBe('beirut')
    expect(regionOfPage(regions, 10)?.governorate).toBe('matn')
  })
  it('is null outside every block', () => {
    expect(regionOfPage(regions, 3)).toBeNull()
    expect(regionOfPage(regions, 21)).toBeNull()
  })
})

describe('spreadIndexOfPage', () => {
  const pages = buildMagazinePages([slot(1, 2, 'full-spread')], 5, {})
  const spreads = toSpreads(pages)
  it('finds a page, including the right side of a full spread', () => {
    expect(spreadIndexOfPage(spreads, 1)).toBe(0)
    expect(spreadIndexOfPage(spreads, 2)).toBe(1)
    expect(spreadIndexOfPage(spreads, 3)).toBe(1)
    expect(spreadIndexOfPage(spreads, 4)).toBe(2)
    expect(spreadIndexOfPage(spreads, 5)).toBe(2)
  })
  it('is -1 when absent', () => {
    expect(spreadIndexOfPage(spreads, 6)).toBe(-1)
    expect(spreadIndexOfPage(spreads, 0)).toBe(-1)
  })
})
