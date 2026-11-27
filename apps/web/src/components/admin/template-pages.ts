import {
  LAYOUT_SHAPE,
  PAGE_LAYOUT_LABELS,
  isPageLayout,
  type PageLayout,
} from '@vardenia/core/page-layouts'

/**
 * Page numbers for the template editor, worked out from the layouts of the
 * rows so far. The admin shows them; nothing here is stored (the slots are
 * built again, from the layouts alone, when the template is saved).
 *
 * A full spread is one row that takes two pages, so it reads "Page 1→2". A row
 * with no layout yet counts as one page until one is chosen.
 *
 * Imported by the admin's browser code, so it imports the narrow
 * `@vardenia/core/page-layouts` entry, not the whole package.
 */

type RowLayout = string | null | undefined

export interface PageSpan {
  first: number
  last: number
}

/** First and last page of every row, in order. */
export function pageSpans(layouts: readonly RowLayout[]): PageSpan[] {
  const spans: PageSpan[] = []
  let next = 1
  for (const layout of layouts) {
    const pages = isPageLayout(layout) ? LAYOUT_SHAPE[layout].pages : 1
    spans.push({ first: next, last: next + pages - 1 })
    next += pages
  }
  return spans
}

/** The page the next row would start on. */
export function nextPage(layouts: readonly RowLayout[]): number {
  const spans = pageSpans(layouts)
  const last = spans[spans.length - 1]
  return last ? last.last + 1 : 1
}

/** "Page 3 · Half page", "Page 1→2 · Full spread", "Page 3 · choose a layout". */
export function rowTitle(layouts: readonly RowLayout[], index: number): string {
  const span = pageSpans(layouts)[index]
  if (!span) return `Page ${index + 1}`
  const where = span.last > span.first ? `Page ${span.first}→${span.last}` : `Page ${span.first}`
  const layout = layouts[index]
  return `${where} · ${isPageLayout(layout) ? PAGE_LAYOUT_LABELS[layout] : 'choose a layout'}`
}

/** More rows than this in one go is a typo, not a magazine. */
export const MAX_RANGE_ROWS = 400

export type RangePlan = { ok: true; count: number } | { ok: false; message: string }

/**
 * "From page 1 to page 10, all half pages": how many rows that adds, or why it
 * cannot. The range must continue where the template ends (pages are in print
 * order), and a full spread needs an even number of pages (two each).
 */
export function planRange(
  layouts: readonly RowLayout[],
  from: number,
  to: number,
  layout: PageLayout,
): RangePlan {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) {
    return { ok: false, message: 'Enter whole page numbers, 1 or more.' }
  }
  const next = nextPage(layouts)
  if (from !== next) {
    return {
      ok: false,
      message:
        next === 1
          ? 'The first page is page 1, so the range starts at 1.'
          : `The template ends at page ${next - 1}, so the range starts at page ${next}.`,
    }
  }
  if (to < from) return { ok: false, message: 'The last page cannot be before the first page.' }
  const pages = to - from + 1
  const per = LAYOUT_SHAPE[layout].pages
  if (pages % per !== 0) {
    return {
      ok: false,
      message: `A ${PAGE_LAYOUT_LABELS[layout].toLowerCase()} takes ${per} pages, so the range must cover an even number of pages. Pages ${from} to ${to} is ${pages}.`,
    }
  }
  const count = pages / per
  if (count > MAX_RANGE_ROWS) {
    return { ok: false, message: `That is ${count} rows at once. Add at most ${MAX_RANGE_ROWS}.` }
  }
  return { ok: true, count }
}
