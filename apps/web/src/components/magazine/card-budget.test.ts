import { describe, expect, it } from 'vitest'
import { PAGE_LAYOUTS } from '@vardenia/core/page-layouts'
import { CARD_STYLE, cardTextAvailable, cardTextStack } from './card-budget'

describe('listing card height budget', () => {
  it.each(PAGE_LAYOUTS)('%s: the worst-case text stack fits its card', (layout) => {
    expect(cardTextStack(layout)).toBeLessThanOrEqual(cardTextAvailable(layout))
  })

  it('also holds for a 600-character CJK description on the full spread', () => {
    // A CJK character is 1em wide: 600 of them need more lines than the
    // clamp allows, so the clamp (not the text) sets the height.
    const s = CARD_STYLE['full-spread']
    const textWidth = 200 - 3.2
    const needed = Math.ceil((600 * s.body) / textWidth)
    expect(needed).toBeGreaterThanOrEqual(s.lines)
    expect(cardTextStack('full-spread')).toBeLessThanOrEqual(cardTextAvailable('full-spread'))
  })

  it('catches an overflow: a full page with a 60% photo and 7 lines would not fit', () => {
    const style = CARD_STYLE['full-page']
    const before = { ...style }
    Object.assign(style, { photo: 60, lines: 7 })
    try {
      expect(cardTextStack('full-page')).toBeGreaterThan(cardTextAvailable('full-page'))
    } finally {
      Object.assign(style, before)
    }
  })
})
