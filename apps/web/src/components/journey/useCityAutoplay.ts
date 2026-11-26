'use client'
import { useEffect, type RefObject } from 'react'

/** How long each city stays before the next (was 6 s; 4.5 s from 11 Nov 2026). */
export const CITY_SLIDE_DELAY = 4500

export function useCityAutoplay(
  root: RefObject<HTMLElement | null>,
  enabled: boolean,
  advance: () => void,
  selection: number,
) {
  useVisibleRotation(root, enabled, advance, selection, CITY_SLIDE_DELAY)
}

/** Restart the reading interval after a change and pause when offscreen. */
export function useVisibleRotation(
  root: RefObject<HTMLElement | null>,
  enabled: boolean,
  advance: () => void,
  selection: number,
  delay: number,
) {
  useEffect(() => {
    const section = root.current
    if (!section || !enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let visible = false
    const sync = () => {
      clearTimeout(timer)
      if (visible && !document.hidden) timer = setTimeout(advance, delay)
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry && entry.intersectionRatio >= 0.35)
        sync()
      },
      { threshold: [0, 0.35] },
    )
    observer.observe(section)
    document.addEventListener('visibilitychange', sync)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [root, enabled, advance, selection, delay])
}
