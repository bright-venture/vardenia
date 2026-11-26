'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The kiosk idle reset: after `idleMs` without input a visible warning counts
 * down `warnMs`, and `onExpire` runs when it reaches zero. "Stay" (or any call
 * of `stay`) restarts the idle clock. While the warning is up, ordinary input
 * does not dismiss it: the owner has to press Stay, so a stray touch does not
 * keep a stranger's details on a shared screen.
 *
 * Deadline based (it compares timestamps once a second) so a throttled
 * background tab still expires on time.
 */

export const IDLE_MS = 3 * 60 * 1000
export const WARN_MS = 30 * 1000

const EVENTS = ['pointerdown', 'keydown', 'input', 'touchstart', 'wheel'] as const

export function useKioskIdle({
  active,
  onExpire,
  idleMs = IDLE_MS,
  warnMs = WARN_MS,
}: {
  active: boolean
  onExpire: () => void
  idleMs?: number
  warnMs?: number
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const lastActivity = useRef(0)
  const warning = useRef(false)
  const expireRef = useRef(onExpire)
  useEffect(() => {
    expireRef.current = onExpire
  })

  useEffect(() => {
    if (!active) return
    lastActivity.current = Date.now()
    warning.current = false

    const touch = () => {
      if (!warning.current) lastActivity.current = Date.now()
    }
    for (const name of EVENTS) document.addEventListener(name, touch, true)

    const interval = setInterval(() => {
      const idle = Date.now() - lastActivity.current
      if (idle >= idleMs + warnMs) {
        warning.current = false
        setSecondsLeft(null)
        expireRef.current()
      } else if (idle >= idleMs) {
        warning.current = true
        setSecondsLeft(Math.ceil((idleMs + warnMs - idle) / 1000))
      }
    }, 1000)

    return () => {
      clearInterval(interval)
      for (const name of EVENTS) document.removeEventListener(name, touch, true)
      warning.current = false
      setSecondsLeft(null)
    }
  }, [active, idleMs, warnMs])

  /** Count as activity (Stay, or something happening on the phone). */
  const stay = useCallback(() => {
    lastActivity.current = Date.now()
    warning.current = false
    setSecondsLeft(null)
  }, [])

  return { secondsLeft: active ? secondsLeft : null, stay }
}
