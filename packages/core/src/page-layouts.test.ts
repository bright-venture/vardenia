import { describe, expect, it } from 'vitest'
import {
  LAYOUT_SHAPE,
  PAGE_LAYOUTS,
  PAGE_LAYOUT_LABELS,
  blockNumbers,
  blockProblem,
  blocksOverlap,
  buildSlots,
  isOffered,
  isPageLayout,
  layoutSlots,
  priceRowsDropped,
  priceRowsProblem,
  slotLabel,
  slotLastPage,
  templateProblem,
  templateTotals,
  type PageLayout,
  type PriceRow,
} from './page-layouts'

const pages = (...layouts: PageLayout[]) => layouts.map((layout) => ({ layout }))
const price = (layout: PageLayout, over: Partial<PriceRow> = {}): PriceRow => ({
  layout,
  offered: true,
  price: 100,
  ...over,
})

describe('page layout codes', () => {
  it('lists the five layouts in order with their labels', () => {
    expect(PAGE_LAYOUTS).toEqual([
      'full-spread',
      'full-page',
      'half-page',
      'three-third',
      'quarter-page',
    ])
    expect(PAGE_LAYOUT_LABELS['full-spread']).toBe('Full spread')
    expect(PAGE_LAYOUT_LABELS['full-page']).toBe('Full page')
    expect(PAGE_LAYOUT_LABELS['half-page']).toBe('Half page')
    expect(PAGE_LAYOUT_LABELS['three-third']).toBe('1/3')
    expect(PAGE_LAYOUT_LABELS['quarter-page']).toBe('1/4')
  })
  it('recognises only known codes', () => {
    expect(isPageLayout('half-page')).toBe(true)
    expect(isPageLayout('poster')).toBe(false)
    expect(isPageLayout(3)).toBe(false)
  })
  it('has the shape of each layout', () => {
    expect(LAYOUT_SHAPE).toEqual({
      'full-spread': { pages: 2, slots: 1 },
      'full-page': { pages: 1, slots: 1 },
      'half-page': { pages: 1, slots: 2 },
      'three-third': { pages: 1, slots: 3 },
      'quarter-page': { pages: 1, slots: 4 },
    })
  })
})

describe('templateTotals', () => {
  it('counts pages and listings per layout', () => {
    expect(templateTotals(pages('full-spread'))).toEqual({ pages: 2, listings: 1 })
    expect(templateTotals(pages('full-page'))).toEqual({ pages: 1, listings: 1 })
    expect(templateTotals(pages('half-page'))).toEqual({ pages: 1, listings: 2 })
    expect(templateTotals(pages('three-third'))).toEqual({ pages: 1, listings: 3 })
    expect(templateTotals(pages('quarter-page'))).toEqual({ pages: 1, listings: 4 })
  })
  it('adds them up', () => {
    expect(templateTotals(pages('full-spread', 'half-page', 'quarter-page'))).toEqual({
      pages: 4,
      listings: 7,
    })
  })
})

describe('buildSlots', () => {
  const slots = buildSlots(pages('full-page', 'half-page', 'full-spread', 'three-third'))
  it('numbers from 1 in page order', () => {
    expect(slots.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
  it('gives each slot the first page of its page, a spread advancing two', () => {
    expect(slots.map((s) => s.page)).toEqual([1, 2, 2, 3, 5, 5, 5])
  })
  it('gives positions, null for single-slot layouts', () => {
    expect(slots.map((s) => s.position)).toEqual([null, 1, 2, null, 1, 2, 3])
    expect(slots.map((s) => s.layout)).toEqual([
      'full-page',
      'half-page',
      'half-page',
      'full-spread',
      'three-third',
      'three-third',
      'three-third',
    ])
  })
  it('is deterministic', () => {
    expect(buildSlots(pages('full-page', 'half-page', 'full-spread', 'three-third'))).toEqual(slots)
  })
  it('is empty for no pages', () => {
    expect(buildSlots([])).toEqual([])
  })
})

describe('templateProblem', () => {
  it('refuses an empty list', () => {
    expect(templateProblem([])).not.toBeNull()
  })
  it('refuses an unknown layout', () => {
    expect(templateProblem([{ layout: 'poster' as PageLayout }])).not.toBeNull()
  })
  it('accepts a valid list', () => {
    expect(templateProblem(pages('full-page', 'quarter-page'))).toBeNull()
  })
})

describe('slotLabel and slotLastPage', () => {
  const [full, , half2, spread] = buildSlots(pages('full-page', 'half-page', 'full-spread'))
  it('writes the three forms', () => {
    expect(slotLabel({ number: 1, page: 12, position: null, layout: 'full-page' })).toBe('Page 12')
    expect(slotLabel({ number: 1, page: 62, position: 3, layout: 'three-third' })).toBe(
      'Page 62, position 3',
    )
    expect(slotLabel({ number: 1, page: 62, position: null, layout: 'full-spread' })).toBe(
      'Pages 62-63',
    )
    expect(full && slotLabel(full)).toBe('Page 1')
    expect(half2 && slotLabel(half2)).toBe('Page 2, position 2')
    expect(spread && slotLabel(spread)).toBe('Pages 3-4')
  })
  it('knows the last page of a slot', () => {
    expect(slotLastPage({ number: 1, page: 62, position: null, layout: 'full-spread' })).toBe(63)
    expect(slotLastPage({ number: 1, page: 62, position: 2, layout: 'half-page' })).toBe(62)
  })
})

describe('priceRowsProblem', () => {
  it('accepts valid rows, including a blank switched-off one', () => {
    expect(
      priceRowsProblem([price('full-page'), price('half-page', { offered: false, price: null })]),
    ).toBeNull()
  })
  it('refuses a price below 1, not finite, or missing while offered', () => {
    expect(priceRowsProblem([price('full-page', { price: 0 })])).not.toBeNull()
    expect(priceRowsProblem([price('full-page', { price: 0.5 })])).not.toBeNull()
    expect(priceRowsProblem([price('full-page', { price: Number.NaN })])).not.toBeNull()
    expect(priceRowsProblem([price('full-page', { price: Infinity })])).not.toBeNull()
    expect(priceRowsProblem([price('full-page', { price: null })])).not.toBeNull()
  })
  it('refuses a bad price even when switched off', () => {
    expect(priceRowsProblem([price('full-page', { offered: false, price: 0 })])).not.toBeNull()
  })
  it('refuses a duplicate or unknown layout', () => {
    expect(
      priceRowsProblem([price('full-page'), price('full-page', { offered: false })]),
    ).toContain('Full page')
    expect(priceRowsProblem([price('poster' as PageLayout)])).not.toBeNull()
  })
})

describe('isOffered', () => {
  const slots = buildSlots(pages('full-page'))
  it('needs offered, a price and a slot of that layout', () => {
    expect(isOffered(price('full-page'), slots)).toBe(true)
    expect(isOffered(price('full-page', { offered: false }), slots)).toBe(false)
    expect(isOffered(price('full-page', { price: null }), slots)).toBe(false)
    expect(isOffered(price('full-page', { price: 0 }), slots)).toBe(false)
    expect(isOffered(price('half-page'), slots)).toBe(false)
  })
})

describe('priceRowsDropped', () => {
  const before = [price('full-page')]
  it('refuses switching off or removing a layout with held slots', () => {
    expect(
      priceRowsDropped(before, [price('full-page', { offered: false })], { 'full-page': 1 }),
    ).toContain('Full page')
    expect(priceRowsDropped(before, [], { 'full-page': 2 })).not.toBeNull()
  })
  it('allows it when nothing is held, or the layout stays on', () => {
    expect(priceRowsDropped(before, [], {})).toBeNull()
    expect(priceRowsDropped(before, [], { 'full-page': 0 })).toBeNull()
    expect(
      priceRowsDropped(before, [price('full-page', { price: 50 })], { 'full-page': 3 }),
    ).toBeNull()
  })
})

describe('layoutSlots', () => {
  const slots = buildSlots(pages('full-page', 'half-page', 'full-page', 'half-page'))
  it('picks the slots of a layout', () => {
    expect(layoutSlots(slots, 'full-page', null).map((s) => s.number)).toEqual([1, 4])
  })
  it('restricts to a number range', () => {
    expect(layoutSlots(slots, 'half-page', { from: 3, to: 5 }).map((s) => s.number)).toEqual([3, 5])
    expect(layoutSlots(slots, 'half-page', { from: 7, to: 9 })).toEqual([])
  })
})

describe('blockProblem', () => {
  // pages: 1 full, 2-3 spread, 4 half, 5 full  => 5 pages
  const slots = buildSlots(pages('full-page', 'full-spread', 'half-page', 'full-page'))
  const total = 5
  it('accepts an aligned block', () => {
    expect(blockProblem(slots, { firstPage: 2, lastPage: 3 }, total)).toBeNull()
    expect(blockProblem(slots, { firstPage: 1, lastPage: 5 }, total)).toBeNull()
  })
  it('refuses outside the pages', () => {
    expect(blockProblem(slots, { firstPage: 0, lastPage: 3 }, total)).not.toBeNull()
    expect(blockProblem(slots, { firstPage: 4, lastPage: 6 }, total)).not.toBeNull()
  })
  it('refuses first after last and fractions', () => {
    expect(blockProblem(slots, { firstPage: 4, lastPage: 2 }, total)).not.toBeNull()
    expect(blockProblem(slots, { firstPage: 1.5, lastPage: 3 }, total)).not.toBeNull()
  })
  it('refuses a spread cut at either edge', () => {
    expect(blockProblem(slots, { firstPage: 1, lastPage: 2 }, total)).not.toBeNull()
    expect(blockProblem(slots, { firstPage: 3, lastPage: 5 }, total)).not.toBeNull()
  })
})

describe('blockNumbers', () => {
  const slots = buildSlots(pages('full-page', 'half-page', 'full-spread', 'three-third'))
  it('gives the contiguous from and to', () => {
    expect(blockNumbers(slots, { firstPage: 2, lastPage: 4 })).toEqual({ from: 2, to: 4 })
    expect(blockNumbers(slots, { firstPage: 5, lastPage: 5 })).toEqual({ from: 5, to: 7 })
  })
  it('is null for an empty block', () => {
    expect(blockNumbers(slots, { firstPage: 8, lastPage: 9 })).toBeNull()
    expect(blockNumbers([], { firstPage: 1, lastPage: 1 })).toBeNull()
  })
})

describe('blocksOverlap', () => {
  it('accepts disjoint blocks', () => {
    expect(
      blocksOverlap([
        { firstPage: 1, lastPage: 3 },
        { firstPage: 4, lastPage: 6 },
      ]),
    ).toBeNull()
  })
  it('refuses overlap', () => {
    expect(
      blocksOverlap([
        { firstPage: 1, lastPage: 4 },
        { firstPage: 4, lastPage: 6 },
      ]),
    ).not.toBeNull()
    expect(
      blocksOverlap([
        { firstPage: 5, lastPage: 9 },
        { firstPage: 1, lastPage: 9 },
      ]),
    ).not.toBeNull()
  })
})
