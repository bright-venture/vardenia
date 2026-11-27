'use client'

import { useEffect, useState } from 'react'
import type { MagazineData } from './types'

/**
 * One issue's pages and businesses, kept fresh while the reader looks at them
 * (`/place-submissions/magazine`).
 *
 * Asks again every `intervalMs` and when the tab comes back to the front, so a
 * number another owner has just reserved appears. At most one request is in
 * flight (a tick while one is pending is skipped), nothing is asked while the
 * tab is hidden, and the pending request is aborted on unmount or when the
 * issue changes.
 *
 * A failed poll keeps the last good data: `error` is set only while nothing
 * has loaded. The result is stored with its key, so an answer can only be shown
 * for the issue and language it was asked for.
 */

export const MAGAZINE_POLL_MS = 30_000

interface Stored {
  key: string
  data: MagazineData | null
  error: boolean
  /** The route said 404 or 409: nothing to show, and asking again cannot help. */
  gone: boolean
}

export const magazineUrl = (issueId: number, locale: string) =>
  `/place-submissions/magazine?issue=${issueId}&locale=${encodeURIComponent(locale)}`

/** The route's reply, or null when it is anything else. */
export function parseMagazine(body: unknown): MagazineData | null {
  if (!body || typeof body !== 'object') return null
  const row = body as Record<string, unknown>
  if (row.ok !== true) return null
  if (!Array.isArray(row.pages) || !Array.isArray(row.regions) || !Array.isArray(row.businesses))
    return null
  if (!row.issue || typeof row.issue !== 'object') return null
  return row as unknown as MagazineData
}

export function useMagazine(
  issueId: number | null,
  locale: string,
  intervalMs: number = MAGAZINE_POLL_MS,
): {
  data: MagazineData | null
  error: boolean
  gone: boolean
  loading: boolean
  retry: () => void
} {
  const [stored, setStored] = useState<Stored | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = issueId === null ? null : `${issueId}:${locale}`

  useEffect(() => {
    if (issueId === null || key === null) return
    const url = magazineUrl(issueId, locale)
    let controller: AbortController | null = null
    let stopped = false

    const load = () => {
      if (stopped || controller) return
      if (typeof document !== 'undefined' && document.hidden) return
      const mine = new AbortController()
      controller = mine
      const settle = (data: MagazineData | null, gone = false) => {
        if (controller === mine) controller = null
        if (stopped || mine.signal.aborted) return
        if (gone) {
          stopped = true
          clearInterval(timer)
          setStored({ key, data: null, error: false, gone: true })
          return
        }
        setStored((old) => {
          const same = old?.key === key ? old : null
          if (data) return { key, data, error: false, gone: false }
          return { key, data: same?.data ?? null, error: !same?.data, gone: false }
        })
      }
      fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: mine.signal })
        .then(async (response) => {
          let body: unknown = null
          try {
            body = await response.json()
          } catch {
            // A 429 from the rate limiter is plain text.
          }
          if (response.status === 404 || response.status === 409) settle(null, true)
          else settle(response.ok ? parseMagazine(body) : null)
        })
        .catch(() => settle(null))
    }

    const onVisible = () => {
      if (!document.hidden) load()
    }
    const timer = setInterval(load, intervalMs)
    load()
    window.addEventListener('focus', load)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', load)
      document.removeEventListener('visibilitychange', onVisible)
      controller?.abort()
    }
  }, [issueId, locale, key, intervalMs, attempt])

  const mine = stored?.key === key ? stored : null
  return {
    data: mine?.data ?? null,
    error: mine?.error ?? false,
    gone: mine?.gone ?? false,
    loading: key !== null && !mine,
    retry: () => setAttempt((n) => n + 1),
  }
}
