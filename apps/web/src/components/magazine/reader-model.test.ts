import { describe, it, expect } from 'vitest'
import { nextPage, spreadPages } from './reader-model'
describe('magazine pagination', () => {
  it('shows a separate cover, paired interior pages and an unpaired final page', () => {
    expect(spreadPages(1, 8, true)).toEqual([1])
    expect(spreadPages(2, 8, true)).toEqual([2, 3])
    expect(spreadPages(3, 8, true)).toEqual([2, 3])
    expect(spreadPages(8, 8, true)).toEqual([8])
  })
  it('mobile and single-page mode do not skip pages', () => {
    expect(spreadPages(3, 8, false)).toEqual([3])
    expect(nextPage(3, 8, false, 1)).toBe(4)
  })
  it('moves through spreads and clamps both ends, including one-page issues', () => {
    expect(nextPage(1, 8, true, 1)).toBe(2)
    expect(nextPage(2, 8, true, 1)).toBe(4)
    expect(nextPage(4, 8, true, -1)).toBe(3)
    expect(nextPage(1, 8, true, -1)).toBe(1)
    expect(nextPage(8, 8, true, 1)).toBe(8)
    expect(nextPage(1, 1, true, 1)).toBe(1)
  })
})
