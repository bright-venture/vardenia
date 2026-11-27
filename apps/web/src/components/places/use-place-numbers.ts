'use client'

import { useCallback, useEffect, useState } from 'react'
import { PAGE_LAYOUTS, isPageLayout, type PageLayout } from '@vardenia/core/page-layouts'

/**
 * The listing numbers of one governorate, for the number picker: per issue,
 * the layouts it offers there, each with its price and its FREE slots (a slot
 * is one listing number at a page and position).
 *
 * Asks `/place-submissions/numbers` with `cache: 'no-store'`: the free slots
 * change whenever another owner submits, and a cached copy would offer numbers
 * that are already gone.
 *
 * # A slow answer for a governorate the owner already left is ignored
 *
 * Every request is tied to a key (the governorate and a reload counter). The
 * effect aborts the request it started when the key changes, and the result is
 * stored with its key, so an answer can only be shown for the key it was asked
 * for. While the stored result belongs to another key the state reads
 * `loading`, which is also why no state is set synchronously in the effect.
 */

/** One free slot: its listing number and where it sits. A spread covers page..lastPage. */
export interface NumbersSlot {
  number: number
  page: number
  /** Null for the one-slot layouts (full page, spread). */
  position: number | null
  lastPage: number
}

/** One layout an issue offers in this governorate: its price and its free slots. */
export interface NumbersLayout {
  layout: PageLayout
  price: number
  downpaymentAmount: number
  slots: NumbersSlot[]
  free: number
}

export interface NumbersIssue {
  issueId: number
  issueTitle: string
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

export type NumbersState = 'idle' | 'loading' | 'ready' | 'error'

export function numbersUrl(governorate: string): string {
  return `/place-submissions/numbers?governorate=${encodeURIComponent(governorate)}`
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

/** The route's issues, or null when the reply is anything else. */
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
 * price beside each layout"), from the issues serving the chosen region.
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

interface Stored {
  key: string
  state: 'ready' | 'error'
  issues: NumbersIssue[]
}

const NONE: NumbersIssue[] = []

export function usePlaceNumbers(governorate: string): {
  state: NumbersState
  issues: NumbersIssue[]
  reload: () => void
} {
  const [version, setVersion] = useState(0)
  const [stored, setStored] = useState<Stored | null>(null)
  const key = `${governorate}#${version}`

  useEffect(() => {
    if (!governorate) return
    const controller = new AbortController()
    const settle = (result: Omit<Stored, 'key'>) => {
      if (!controller.signal.aborted) setStored({ key, ...result })
    }

    fetch(numbersUrl(governorate), {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        let body: unknown = null
        try {
          body = await response.json()
        } catch {
          // 429 from the rate limiter is plain text.
        }
        const issues = response.ok ? parseNumbersResponse(body) : null
        settle(issues ? { state: 'ready', issues } : { state: 'error', issues: NONE })
      })
      .catch(() => settle({ state: 'error', issues: NONE }))

    return () => controller.abort()
  }, [governorate, key])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  if (!governorate) return { state: 'idle', issues: NONE, reload }
  if (stored?.key !== key) return { state: 'loading', issues: NONE, reload }
  return { state: stored.state, issues: stored.issues, reload }
}
