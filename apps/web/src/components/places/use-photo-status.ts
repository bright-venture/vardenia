'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { postStatus } from './flow-client'

/**
 * Polls the photo status of the upload session while step 2 is on screen.
 *
 * One request every 2 seconds. It stops on unmount, while the tab is hidden
 * (and asks again at once when the tab comes back), and slows down (doubling,
 * up to 16 seconds) while the server or the network is failing, so a struggling
 * server is not hammered. A 404, or an answer saying the session is no longer
 * live, calls `onGone` once and stops. The token is read from the argument
 * only; it goes in the request body and is never stored or logged.
 */

export const POLL_MS = 2000
export const MAX_BACKOFF_MS = 16000

export interface PhotoStatus {
  logo: boolean
  hero: boolean
}

export function usePhotoStatus({
  token,
  onGone,
  onReceived,
}: {
  token: string
  onGone: () => void
  /** Called when a photo that was missing has arrived (kiosk idle clock restarts). */
  onReceived?: () => void
}) {
  const [status, setStatus] = useState<PhotoStatus>({ logo: false, hero: false })
  const goneRef = useRef(onGone)
  const receivedRef = useRef(onReceived)
  useEffect(() => {
    goneRef.current = onGone
    receivedRef.current = onReceived
  })

  const seen = useRef<PhotoStatus>({ logo: false, hero: false })

  /** Flags only ever turn on: a late, older answer cannot untick a photo. */
  const markReceived = useCallback((logo: boolean, hero: boolean) => {
    const next = { logo: seen.current.logo || logo, hero: seen.current.hero || hero }
    if (next.logo === seen.current.logo && next.hero === seen.current.hero) return
    seen.current = next
    setStatus(next)
    receivedRef.current?.()
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let delay = POLL_MS
    let inFlight = false

    const schedule = (ms: number) => {
      timer = setTimeout(() => void tick(), ms)
    }

    async function tick() {
      timer = null
      if (cancelled) return
      // Hidden tab: wait for it to come back instead of polling in the dark.
      if (document.hidden) return
      inFlight = true
      const result = await postStatus(token)
      inFlight = false
      if (cancelled) return
      if (result.kind === 'gone' || (result.kind === 'ok' && !result.live)) {
        goneRef.current()
        return
      }
      if (result.kind === 'error') {
        delay = Math.min(delay * 2, MAX_BACKOFF_MS)
      } else {
        delay = POLL_MS
        markReceived(result.logoReceived, result.heroReceived)
      }
      schedule(delay)
    }

    const onVisible = () => {
      if (!document.hidden && timer === null && !inFlight && !cancelled) void tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    void tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [token, markReceived])

  return { status, markReceived }
}
