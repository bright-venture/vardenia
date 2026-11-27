import type { PageLayout } from '@vardenia/core/page-layouts'
import { PAGE_HEIGHT } from '../places/preview-model'

/**
 * How a listing card is arranged for its layout, and the height budget that
 * keeps its worst-case text inside it. All sizes are in `u`: one page width /
 * 100 (a full spread is 200u wide, every page 100u wide and PAGE_HEIGHT tall).
 *
 * `tall` stacks the photo over the text, `wide` puts the photo beside it (half
 * page and 1/3), `small` is the 2x2 quarter. `photo` is the photo's share of a
 * tall or small card's height. Changing a number here is checked by
 * card-budget.test.ts: the text stack must stay within the card.
 */
export interface CardStyle {
  kind: 'tall' | 'wide' | 'small'
  name: number
  body: number
  /** Description lines allowed before the clamp. */
  lines: number
  /** Photo share of the card height, percent (tall and small). */
  photo: number
  /** Rows the page's grid is split into, and the cards across it. */
  rows: number
  columns: number
}

export const CARD_STYLE: Record<PageLayout, CardStyle> = {
  'full-spread': { kind: 'tall', name: 5, body: 2.6, lines: 8, photo: 50, rows: 1, columns: 1 },
  'full-page': { kind: 'tall', name: 6, body: 3.2, lines: 6, photo: 50, rows: 1, columns: 1 },
  'half-page': { kind: 'wide', name: 4.4, body: 2.6, lines: 5, photo: 0, rows: 2, columns: 1 },
  'three-third': { kind: 'wide', name: 3.6, body: 2.2, lines: 2, photo: 0, rows: 3, columns: 1 },
  'quarter-page': { kind: 'small', name: 3.4, body: 2.2, lines: 3, photo: 45, rows: 2, columns: 2 },
}

/** Padding of the text block, each side. */
export const CARD_PADDING = 1.6
/** Gap between the text block's lines. */
export const CARD_GAP = 0.6
/** The footer under the cards: its 2u text at line height 1.5, plus padding. */
export const FOOTER_HEIGHT = 2 * 1.5 + 2.4
/** Grid lines between cards, and a margin for rounding. */
const SLACK = 1

const lineBox = (size: number, lineHeight: number, lines: number) => size * lineHeight * lines

/** Height of a card's text block at its worst input. */
export function cardTextStack(layout: PageLayout): number {
  const s = CARD_STYLE[layout]
  return (
    CARD_PADDING * 2 +
    lineBox(s.body * 0.8, 1.5, 1) + // category
    lineBox(s.name, 1.25, 2) + // name, clamped to 2 lines
    lineBox(s.body, 1.5, s.lines) + // description, clamped
    lineBox(s.body, 1.5, 2) + // address, phone and hours, clamped to 2 lines
    CARD_GAP * 3
  )
}

/** Height the text block has: the whole card, or what the photo leaves. */
export function cardTextAvailable(layout: PageLayout): number {
  const s = CARD_STYLE[layout]
  const card = (PAGE_HEIGHT - FOOTER_HEIGHT - SLACK) / s.rows
  return s.kind === 'wide' ? card : card * (1 - s.photo / 100)
}
