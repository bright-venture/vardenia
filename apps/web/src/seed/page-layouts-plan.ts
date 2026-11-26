/**
 * What seed/page-layouts.ts would do, worked out from plain values so it can
 * be tested without a database: the sample template, the placeholder prices,
 * the governorate page blocks, and which steps its own sample issue still
 * needs.
 */

import {
  blockProblem,
  blocksOverlap,
  buildSlots,
  slotLastPage,
  templateTotals,
  type PageLayout,
  type Slot,
  type TemplatePage,
} from '@vardenia/core'

export const TEMPLATE_NAME = 'Sample template (test values)'

/**
 * The seed's own issue. "All Lebanon" (seed/listing-ranges.ts) already has
 * manual number ranges, and an issue with ranges cannot take a template, so the
 * sample gets an issue of its own instead of touching a real one. The number is
 * far above any real issue's.
 */
export const SAMPLE_ISSUE_TITLE = 'Sample issue (test values)'
export const SAMPLE_ISSUE_NUMBER = 9001

/** The same seven governorates, in the same order, as seed/listing-ranges.ts. */
export const GOVERNORATES = [
  'beirut',
  'matn',
  'keserwan',
  'north-lebanon',
  'beqaa',
  'chouf',
  'south-lebanon',
] as const

const run = (layout: PageLayout, count: number): TemplatePage[] =>
  Array.from({ length: count }, () => ({ layout }))

/**
 * A spread of pages first, then full pages, halves, thirds and quarters:
 * 100 pages and 251 listings. Test values only.
 */
export const SAMPLE_PAGES: TemplatePage[] = [
  ...run('full-spread', 2), // pages 1-4
  ...run('full-page', 20), // 5-24
  ...run('half-page', 25), // 25-49
  ...run('three-third', 25), // 50-74
  ...run('quarter-page', 26), // 75-100
]

/** TEST VALUES, not the real price list: placeholders so the form can be tried on staging. */
export const PLACEHOLDER_PRICES: { layout: PageLayout; offered: boolean; price: number }[] = [
  { layout: 'full-spread', offered: true, price: 3000 },
  { layout: 'full-page', offered: true, price: 1500 },
  { layout: 'half-page', offered: true, price: 800 },
  { layout: 'three-third', offered: true, price: 600 },
  { layout: 'quarter-page', offered: true, price: 300 },
]

export interface PlannedBlock {
  governorate: string
  firstPage: number
  lastPage: number
}

/**
 * Splits the pages into one block per governorate, as evenly as it can, moving
 * an edge forward when it would cut a spread. Every page lands in exactly one
 * block; throws if the result is not a valid set of blocks.
 */
export function planBlocks(
  slots: readonly Slot[],
  totalPages: number,
  governorates: readonly string[] = GOVERNORATES,
): PlannedBlock[] {
  const spreadStarts = new Set(slots.filter((s) => slotLastPage(s) > s.page).map((s) => s.page))
  const count = governorates.length
  if (totalPages < count) throw new Error(`${totalPages} pages cannot be split in ${count}.`)
  const blocks: PlannedBlock[] = []
  let first = 1
  governorates.forEach((governorate, i) => {
    let last = i === count - 1 ? totalPages : Math.round(((i + 1) * totalPages) / count)
    last = Math.max(last, first)
    // A spread starting on `last` would continue into the next block.
    while (last < totalPages && spreadStarts.has(last)) last++
    blocks.push({ governorate, firstPage: first, lastPage: last })
    first = last + 1
  })
  const problem =
    blocks.map((b) => blockProblem(slots, b, totalPages)).find(Boolean) ??
    blocksOverlap(blocks) ??
    (first !== totalPages + 1 ? 'The blocks do not cover every page.' : null)
  if (problem) throw new Error(`Cannot split the pages: ${problem}`)
  return blocks
}

export interface SampleIssueState {
  /** No template, the sample template, or some other one. */
  template: 'none' | 'sample' | 'other'
  /** Whether its price table has any row. */
  hasPrices: boolean
  rangeCount: number
  /** Businesses holding a listing number in the issue. */
  heldCount: number
}

export type SampleIssuePlan =
  { skip: string } | { create: boolean; link: boolean; prices: boolean; blocks: boolean }

/**
 * The steps the sample issue still needs, given the issue with the sample
 * title (null when there is none) and the title of another issue already using
 * the sample number (null when free). Never overwrites: a step already done is
 * left out, and an issue in any state the seed did not leave it in is skipped.
 * Blocks come last, after the template is linked: the issue's hook refuses a
 * template change once ranges exist.
 */
export function sampleIssuePlan(
  existing: SampleIssueState | null,
  numberUsedBy: string | null,
): SampleIssuePlan {
  if (!existing) {
    if (numberUsedBy !== null) {
      return { skip: `issue number ${SAMPLE_ISSUE_NUMBER} is already used by "${numberUsedBy}"` }
    }
    return { create: true, link: true, prices: true, blocks: true }
  }
  if (existing.heldCount > 0) {
    return { skip: `${existing.heldCount} business(es) already hold a number in it` }
  }
  if (existing.template === 'other') return { skip: 'it already has another template' }
  if (existing.rangeCount > 0) {
    return { skip: `it already has ${existing.rangeCount} listing range(s)` }
  }
  return {
    create: false,
    link: existing.template === 'none',
    prices: !existing.hasPrices,
    blocks: true,
  }
}

/** The sample template as dry-run text. */
export function describeTemplate(pages: readonly TemplatePage[] = SAMPLE_PAGES): string {
  const totals = templateTotals(pages)
  return `${totals.pages} pages, ${totals.listings} listings (${buildSlots(pages).length} slots)`
}
