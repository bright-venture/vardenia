/**
 * The pages of an issue as a reader turns them: which page shows which
 * listing numbers, and which pages face each other.
 *
 * Pure maths over the issue's stored slots (page-layouts) and its page count.
 * Page numbers come only from those: nothing here knows a template or a
 * governorate, and no layout is named except through LAYOUT_SHAPE.
 */

import { LAYOUT_SHAPE, type PageLayout, type Slot } from './page-layouts'

export type MagazinePage =
  | { page: number; kind: 'editorial'; note: string | null }
  | {
      page: number
      kind: 'listings'
      layout: PageLayout
      /** 2 for a full spread: one entry covering its page and the next. */
      span: 1 | 2
      slots: { number: number; position: number | null }[]
    }

/** A governorate's block of pages, for the footer and a jump menu. */
export interface MagazineRegion {
  governorate: string
  firstPage: number
  lastPage: number
}

/** What the reader sees at once: 1 or 2 entries. A full spread is one entry that spans both sides. */
export type Spread = MagazinePage[]

const spanOf = (page: MagazinePage): 1 | 2 => (page.kind === 'listings' ? page.span : 1)

/**
 * Every page 1..pageCount once. A page with a slot lists its slots by
 * position; a page without one is editorial, with the template's note for it
 * (null when none). A spread is one entry at its left page and its second
 * page makes no entry.
 */
export function buildMagazinePages(
  slots: readonly Slot[],
  pageCount: number,
  notes: Record<number, string | null>,
): MagazinePage[] {
  const byPage = new Map<number, Slot[]>()
  for (const slot of slots) byPage.set(slot.page, [...(byPage.get(slot.page) ?? []), slot])

  const pages: MagazinePage[] = []
  let coveredUntil = 0
  for (let page = 1; page <= pageCount; page++) {
    if (page <= coveredUntil) continue
    const here = byPage.get(page)
    const first = here?.[0]
    if (!here || !first) {
      pages.push({ page, kind: 'editorial', note: notes[page] || null })
      continue
    }
    const span = LAYOUT_SHAPE[first.layout].pages
    if (span === 2) coveredUntil = page + 1
    pages.push({
      page,
      kind: 'listings',
      layout: first.layout,
      span,
      slots: [...here]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.number - b.number)
        .map((s) => ({ number: s.number, position: s.position })),
    })
  }
  return pages
}

/**
 * Pages 1, then 2-3, 4-5...: the left page of a spread is even. A spread
 * entry sits alone on the spread of its left page; a page whose neighbour is
 * missing (an odd last page) stands alone.
 */
export function toSpreads(pages: readonly MagazinePage[]): Spread[] {
  const spreads: Spread[] = []
  let key: number | null = null
  for (const entry of pages) {
    if (spanOf(entry) === 2) {
      spreads.push([entry])
      key = null
      continue
    }
    const entryKey = entry.page % 2 === 0 ? entry.page : entry.page - 1
    const last = spreads[spreads.length - 1]
    if (key === entryKey && last) last.push(entry)
    else spreads.push([entry])
    key = entryKey
  }
  return spreads
}

/** The block that contains the page, or null. */
export function regionOfPage(
  regions: readonly MagazineRegion[],
  page: number,
): MagazineRegion | null {
  return regions.find((r) => page >= r.firstPage && page <= r.lastPage) ?? null
}

/** The index of the spread showing the page (either side of a full spread), or -1. */
export function spreadIndexOfPage(spreads: readonly Spread[], page: number): number {
  return spreads.findIndex((spread) =>
    spread.some((entry) => page >= entry.page && page < entry.page + spanOf(entry)),
  )
}
