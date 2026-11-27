'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * One fresh JSON read for the "add your place" form, keyed on its URL.
 *
 * Asks with `cache: 'no-store'`: the issues, places and free slots change
 * whenever another owner submits, and a cached copy would offer what is gone.
 *
 * # A slow answer for a choice the owner already left is ignored
 *
 * Every request is tied to a key (the URL and a reload counter). The effect
 * aborts the request it started when the key changes, and the result is stored
 * with its key, so an answer can only be shown for the key it was asked for.
 * While the stored result belongs to another key the state reads `loading`,
 * which is also why no state is set synchronously in the effect.
 *
 * `url` null: nothing to ask yet (`idle`).
 */

export type FreshState = 'idle' | 'loading' | 'ready' | 'error'

interface Stored<T> {
  key: string
  value: T | null
}

export function useFreshJson<T>(
  url: string | null,
  parse: (body: unknown) => T | null,
): { state: FreshState; value: T | null; reload: () => void } {
  const [version, setVersion] = useState(0)
  const [stored, setStored] = useState<Stored<T> | null>(null)
  const key = url === null ? null : `${url}#${version}`

  useEffect(() => {
    if (url === null || key === null) return
    const controller = new AbortController()
    const settle = (value: T | null) => {
      if (!controller.signal.aborted) setStored({ key, value })
    }
    fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        let body: unknown = null
        try {
          body = await response.json()
        } catch {
          // 429 from the rate limiter is plain text.
        }
        settle(response.ok ? parse(body) : null)
      })
      .catch(() => settle(null))
    return () => controller.abort()
    // `parse` must be a stable (module-level) function: a new one asks again.
  }, [url, key, parse])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  if (key === null) return { state: 'idle', value: null, reload }
  if (stored?.key !== key) return { state: 'loading', value: null, reload }
  if (stored.value === null) return { state: 'error', value: null, reload }
  return { state: 'ready', value: stored.value, reload }
}
