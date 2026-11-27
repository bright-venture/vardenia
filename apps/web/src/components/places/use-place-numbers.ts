'use client'

import { PAGE_LAYOUTS, isPageLayout, type PageLayout } from '@vardenia/core/page-layouts'
import { useFreshJson, type FreshState } from './use-fresh-json'

/**
 * The listing numbers of one place of one issue, for the number picker: the
 * layouts the issue offers there, each with its price and its FREE slots (a
 * slot is one listing number at a page and position).
 *
 * The form is issue first (27 November 2026): the owner chooses the issue,
 * then a governorate (All Lebanon issue) or a city (issue for one
 * governorate), and only then are the numbers asked for, with
 * `cache: 'no-store'` (use-fresh-json): the free slots change whenever another
 * owner submits. An answer for a choice the owner already left is ignored.
 */

/** One free slot: its listing number and where it sits. A spread covers page..lastPage. */
export interface NumbersSlot {
  number: number
  page: number
  /** Null for the one-slot layouts (full page, spread). */
  position: number | null
  lastPage: number
}

/** One layout an issue offers in the chosen place: its price and its free slots. */
export interface NumbersLayout {
  layout: PageLayout
  price: number
  downpaymentAmount: number
  slots: NumbersSlot[]
  free: number
}

export type NumbersCoverage = 'all-lebanon' | 'governorate'

export interface NumbersIssue {
  issueId: number
  issueTitle: string
  /** 'governorate': an issue for one governorate, whose blocks are cities. */
  coverage: NumbersCoverage
  from: number
  to: number
  taken: number[]
  /** The Settings currency the prices are in; '' when the route did not say. */
  currency: string
  /** In the form's order (PAGE_LAYOUTS). Empty for a legacy issue: it offers nothing. */
  layouts: NumbersLayout[]
}

/** One issue as the picker shows it for the chosen layout. */
export interface LayoutIssue {
  issueId: number
  issueTitle: string
  currency: string
  price: number
  downpaymentAmount: number
  slots: NumbersSlot[]
}

export type NumbersState = FreshState

/**
 * What the numbers are asked for: the issue and its place. An All Lebanon
 * issue is asked with the governorate, an issue for one governorate with the
 * city (its governorate comes from the issue, server side).
 */
export type NumbersQuery =
  | { issueId: number; governorate: string; city?: undefined }
  | { issueId: number; city: string; governorate?: undefined }

export function numbersUrl(query: NumbersQuery): string {
  const base = `/place-submissions/numbers?issue=${query.issueId}`
  return query.city !== undefined
    ? `${base}&city=${encodeURIComponent(query.city)}`
    : `${base}&governorate=${encodeURIComponent(query.governorate)}`
}

const isWhole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value)

const isAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

function parseSlot(raw: unknown): NumbersSlot | null {
  if (!raw || typeof raw !== 'object') return null
  const slot = raw as Record<string, unknown>
  const { number, page, position, lastPage } = slot
  if (!isWhole(number) || number < 1 || !isWhole(page) || page < 1) return null
  if (position !== null && !(isWhole(position) && position >= 1)) return null
  if (!isWhole(lastPage) || lastPage < page) return null
  return { number, page, position, lastPage }
}

function parseLayout(raw: unknown): NumbersLayout | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (!isPageLayout(row.layout) || !isAmount(row.price) || row.price <= 0) return null
  if (!isAmount(row.downpaymentAmount)) return null
  const slots = Array.isArray(row.slots)
    ? row.slots.map(parseSlot).filter((s): s is NumbersSlot => s !== null)
    : []
  // Counted from the slots kept, so the heading never promises a dropped one.
  return {
    layout: row.layout,
    price: row.price,
    downpaymentAmount: row.downpaymentAmount,
    slots,
    free: slots.length,
  }
}

/**
 * An issue's layouts in the form's order. The route answers in price-table
 * order, which staff can change; the owner always sees the same order. A
 * layout listed twice keeps its first row.
 */
function parseLayouts(raw: unknown): NumbersLayout[] {
  if (!Array.isArray(raw)) return []
  const byLayout = new Map<PageLayout, NumbersLayout>()
  for (const row of raw) {
    const layout = parseLayout(row)
    if (layout && !byLayout.has(layout.layout)) byLayout.set(layout.layout, layout)
  }
  return PAGE_LAYOUTS.flatMap((code) => byLayout.get(code) ?? [])
}

/** The route's issues (at most one), or null when the reply is anything else. */
export function parseNumbersResponse(body: unknown): NumbersIssue[] | null {
  if (!body || typeof body !== 'object') return null
  const { ok, issues } = body as { ok?: unknown; issues?: unknown }
  if (ok !== true || !Array.isArray(issues)) return null
  const out: NumbersIssue[] = []
  for (const raw of issues) {
    if (!raw || typeof raw !== 'object') continue
    const issue = raw as Record<string, unknown>
    if (!isWhole(issue.issueId) || !isWhole(issue.from) || !isWhole(issue.to)) continue
    if (issue.from < 1 || issue.to < issue.from) continue
    out.push({
      issueId: issue.issueId,
      issueTitle: typeof issue.issueTitle === 'string' ? issue.issueTitle : '',
      coverage: issue.coverage === 'governorate' ? 'governorate' : 'all-lebanon',
      from: issue.from,
      to: issue.to,
      taken: Array.isArray(issue.taken) ? issue.taken.filter(isWhole) : [],
      currency: typeof issue.currency === 'string' ? issue.currency : '',
      layouts: parseLayouts(issue.layouts),
    })
  }
  return out
}

/**
 * The issues that offer `layout`, each with that layout's price and free
 * slots. Nothing while no layout is chosen: a number only means something
 * once the owner knows what it buys. A legacy issue (no layouts) never shows.
 */
export function issuesForLayout(
  issues: readonly NumbersIssue[],
  layout: PageLayout | null,
): LayoutIssue[] {
  if (layout === null) return []
  return issues.flatMap((issue) => {
    const row = issue.layouts.find((l) => l.layout === layout)
    if (!row) return []
    return [
      {
        issueId: issue.issueId,
        issueTitle: issue.issueTitle,
        currency: issue.currency,
        price: row.price,
        downpaymentAmount: row.downpaymentAmount,
        slots: row.slots,
      },
    ]
  })
}

/**
 * The price to show beside a layout in the size choice (PRD v7 section 9: "the
 * price beside each layout"), from the chosen issue's block for the chosen place.
 * Null when no issue offers the layout there, so no price is shown for it.
 * When issues price it differently the lowest is shown, marked `from`.
 */
export function layoutPrice(
  issues: readonly NumbersIssue[],
  layout: PageLayout,
): { amount: number; currency: string; from: boolean } | null {
  const offers = issuesForLayout(issues, layout)
  if (offers.length === 0) return null
  const prices = offers.map((o) => o.price)
  const amount = Math.min(...prices)
  const cheapest = offers.find((o) => o.price === amount)!
  return { amount, currency: cheapest.currency, from: new Set(prices).size > 1 }
}

const NONE: NumbersIssue[] = []

/** The numbers of the chosen issue and place; idle while either is missing (`query` null). */
export function usePlaceNumbers(query: NumbersQuery | null): {
  state: NumbersState
  issues: NumbersIssue[]
  reload: () => void
} {
  const { state, value, reload } = useFreshJson(
    query === null ? null : numbersUrl(query),
    parseNumbersResponse,
  )
  return { state, issues: value ?? NONE, reload }
}
