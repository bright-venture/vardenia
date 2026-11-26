'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * The listing numbers of one governorate, for the number picker.
 *
 * Asks `/place-submissions/numbers` with `cache: 'no-store'`: the taken list
 * changes whenever another owner submits, and a cached copy would offer numbers
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

export interface NumbersIssue {
  issueId: number
  issueTitle: string
  from: number
  to: number
  taken: number[]
}

export type NumbersState = 'idle' | 'loading' | 'ready' | 'error'

export function numbersUrl(governorate: string): string {
  return `/place-submissions/numbers?governorate=${encodeURIComponent(governorate)}`
}

const isWhole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value)

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
    })
  }
  return out
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
