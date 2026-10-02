'use client'

/**
 * Scroll-driven motion for the October 2026 redesign: the pinned home page
 * sequences (the manifesto's composing words, the scan) and the reduced-motion
 * preference they all defer to.
 *
 * Client-only: everything here reads the window. Components that use it render
 * their resting state on the server, so nothing is missing before hydration.
 */

import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react'

export const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

/** Ease in and out over 0..1. */
export const smooth = (t: number) => t * t * (3 - 2 * t)

const MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const subscribeMotion = (onChange: () => void) => {
  const query = window.matchMedia(MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * Whether the reader asked their system for less motion.
 *
 * Through `useSyncExternalStore` so the server render (motion on) and the first
 * client render agree, and the switch arrives as an ordinary update rather than
 * a hydration mismatch. Pass `serverValue: true` to render the still version
 * first instead, for components whose moving state would be blank on the server.
 */
export function useReducedMotion(serverValue = false): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(MOTION_QUERY).matches,
    () => serverValue,
  )
}

/**
 * How far the reader has scrolled through a tall pinned section: 0 when its top
 * reaches the top of the viewport, 1 when its bottom leaves. Drives the
 * scrubbed sequences.
 */
export function usePinProgress(ref: RefObject<HTMLElement | null>, disabled = false): number {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (disabled) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        const travel = el.offsetHeight - window.innerHeight
        if (travel <= 0) return
        setProgress(clamp01(-el.getBoundingClientRect().top / travel))
      })
    }
    measure()
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [disabled, ref])

  return progress
}

/** True once the element has come into view, and from then on. */
export function useInViewOnce<T extends HTMLElement>(
  ref: RefObject<T | null>,
  threshold = 0.35,
): boolean {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, threshold])

  return inView
}
