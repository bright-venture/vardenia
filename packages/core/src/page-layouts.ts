/**
 * Page layouts, templates and slots - how much of the magazine a business buys
 * (full spread, full page, ...), as rules rather than as tables.
 *
 * A template is an ordered list of pages, one layout each. Walking it in order
 * gives the slots: one listing number per slot, numbered from 1. An issue
 * copies those slots and prices each layout; a governorate owns a block of
 * pages, which is a contiguous run of numbers because slots are numbered in
 * page order. One listing number is still one business, whatever the layout.
 *
 * Nothing here reads or writes a database: callers hand in the rows they
 * already loaded, and get back a problem to show or numbers to use.
 */

/** The layouts, in the order the admin and the form list them. Codes are stored. */
export const PAGE_LAYOUTS = [
  'full-spread',
  'full-page',
  'half-page',
  'three-third',
  'quarter-page',
] as const

export type PageLayout = (typeof PAGE_LAYOUTS)[number]

/** English labels, for the admin and e-mails (the form translates its own). */
export const PAGE_LAYOUT_LABELS: Record<PageLayout, string> = {
  'full-spread': 'Full spread',
  'full-page': 'Full page',
  'half-page': 'Half page',
  'three-third': '1/3',
  'quarter-page': '1/4',
}

export const isPageLayout = (value: unknown): value is PageLayout =>
  typeof value === 'string' && (PAGE_LAYOUTS as readonly string[]).includes(value)

/** What each layout takes up. A spread is one slot over two pages. */
export const LAYOUT_SHAPE: Record<PageLayout, { pages: 1 | 2; slots: 1 | 2 | 3 | 4 }> = {
  'full-spread': { pages: 2, slots: 1 },
  'full-page': { pages: 1, slots: 1 },
  'half-page': { pages: 1, slots: 2 },
  'three-third': { pages: 1, slots: 3 },
  'quarter-page': { pages: 1, slots: 4 },
}

/** One entry of a template: the layout of one page (a spread is one entry, two pages). */
export interface TemplatePage {
  layout: PageLayout
}

/** One sellable listing. `page` is the first page it sits on; `position` is null when the layout has one slot. */
export interface Slot {
  number: number
  page: number
  position: number | null
  layout: PageLayout
}

/** The slots of a template, numbered from 1 in page order. The same pages always give the same slots. */
export function buildSlots(pages: readonly TemplatePage[]): Slot[] {
  const slots: Slot[] = []
  let page = 1
  for (const entry of pages) {
    const shape = LAYOUT_SHAPE[entry.layout]
    if (!shape) continue
    for (let i = 1; i <= shape.slots; i++) {
      slots.push({
        number: slots.length + 1,
        page,
        position: shape.slots === 1 ? null : i,
        layout: entry.layout,
      })
    }
    page += shape.pages
  }
  return slots
}

/** Pages and listings a template adds up to. Never typed by hand. */
export function templateTotals(pages: readonly TemplatePage[]): {
  pages: number
  listings: number
} {
  let p = 0
  let listings = 0
  for (const entry of pages) {
    const shape = LAYOUT_SHAPE[entry.layout]
    if (!shape) continue
    p += shape.pages
    listings += shape.slots
  }
  return { pages: p, listings }
}

/** Why a template cannot be saved, or null. Meant for the admin. */
export function templateProblem(pages: readonly TemplatePage[]): string | null {
  if (pages.length === 0) return 'A template needs at least one page.'
  for (const entry of pages) {
    if (!isPageLayout(entry.layout)) return `Unknown layout "${String(entry.layout)}".`
  }
  return null
}

/** The last page a slot covers: the next page too for a spread. */
export const slotLastPage = (slot: Slot): number =>
  slot.layout === 'full-spread' ? slot.page + 1 : slot.page

/** "Page 62, position 3", "Page 12" or "Pages 62-63". English, for admin and e-mails. */
export function slotLabel(slot: Slot): string {
  const last = slotLastPage(slot)
  if (last > slot.page) return `Pages ${slot.page}-${last}`
  if (slot.position === null) return `Page ${slot.page}`
  return `Page ${slot.page}, position ${slot.position}`
}

/** One layout of one issue's price table. A blank price arrives as null. */
export interface PriceRow {
  layout: PageLayout
  offered: boolean
  price: number | null
}

const validPrice = (price: unknown): price is number =>
  typeof price === 'number' && Number.isFinite(price) && price >= 1

/**
 * Why these price rows cannot be saved, or null. A layout cannot be listed
 * twice, and a price that is present (or needed because the row is offered)
 * must be a number of at least 1. A switched-off row may be left blank.
 */
export function priceRowsProblem(rows: readonly PriceRow[]): string | null {
  const seen = new Set<PageLayout>()
  for (const row of rows) {
    if (!isPageLayout(row.layout)) return `Unknown layout "${String(row.layout)}".`
    const name = PAGE_LAYOUT_LABELS[row.layout]
    if (seen.has(row.layout)) return `${name} is listed more than once.`
    seen.add(row.layout)
    const present = row.price !== null && row.price !== undefined
    if ((row.offered || present) && !validPrice(row.price)) {
      return `${name}: the price must be a number of at least 1.`
    }
  }
  return null
}

/** True when the row is switched on, priced, and the issue has a slot of that layout. */
export const isOffered = (row: PriceRow, slots: readonly Slot[]): boolean =>
  row.offered && validPrice(row.price) && slots.some((s) => s.layout === row.layout)

/** The slots of a layout, limited to a number range (a governorate's block) when one is given. */
export function layoutSlots(
  slots: readonly Slot[],
  layout: PageLayout,
  range: { from: number; to: number } | null,
): Slot[] {
  return slots.filter(
    (s) => s.layout === layout && (!range || (s.number >= range.from && s.number <= range.to)),
  )
}

/**
 * Why the price table cannot change from `before` to `after`, or null: a layout
 * that still has held slots cannot be switched off or removed.
 */
export function priceRowsDropped(
  before: readonly PriceRow[],
  after: readonly PriceRow[],
  heldByLayout: Record<string, number>,
): string | null {
  for (const old of before) {
    if (!old.offered) continue
    const held = heldByLayout[old.layout] ?? 0
    if (held <= 0) continue
    const next = after.find((r) => r.layout === old.layout)
    if (!next || !next.offered) {
      return `${PAGE_LAYOUT_LABELS[old.layout]} cannot be switched off or removed: ${held} ${held === 1 ? 'slot is' : 'slots are'} held under it.`
    }
  }
  return null
}

/** A governorate's block, in pages of the template. */
export interface PageBlock {
  firstPage: number
  lastPage: number
}

/** Why a page block is unusable for these slots, or null. A spread may not be cut by either edge. */
export function blockProblem(
  slots: readonly Slot[],
  block: PageBlock,
  totalPages: number,
): string | null {
  const { firstPage, lastPage } = block
  if (!Number.isInteger(firstPage) || !Number.isInteger(lastPage))
    return 'The pages need whole numbers for both ends.'
  if (firstPage < 1 || lastPage > totalPages) return `The pages must stay within 1-${totalPages}.`
  if (firstPage > lastPage) return 'The first page is after the last page.'
  for (const slot of slots) {
    if (slotLastPage(slot) === slot.page) continue
    if (slot.page === lastPage || slot.page + 1 === firstPage) {
      return `The block cuts the spread on pages ${slot.page}-${slot.page + 1}.`
    }
  }
  return null
}

/** The listing numbers on a block's pages: contiguous, or null when it holds no slot. */
export function blockNumbers(
  slots: readonly Slot[],
  block: PageBlock,
): { from: number; to: number } | null {
  const inside = slots.filter((s) => s.page >= block.firstPage && slotLastPage(s) <= block.lastPage)
  if (inside.length === 0) return null
  const numbers = inside.map((s) => s.number)
  return { from: Math.min(...numbers), to: Math.max(...numbers) }
}

/** Why these blocks cannot sit in one issue together, or null. */
export function blocksOverlap(blocks: readonly PageBlock[]): string | null {
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i] as PageBlock
      const b = blocks[j] as PageBlock
      if (a.firstPage <= b.lastPage && b.firstPage <= a.lastPage) {
        return `Pages ${a.firstPage}-${a.lastPage} overlap pages ${b.firstPage}-${b.lastPage}.`
      }
    }
  }
  return null
}
