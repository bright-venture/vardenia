'use client'
import { useEffect, type RefObject } from 'react'

export const CITY_SLIDE_DELAY = 6000

/** A new reading interval starts after selection; offscreen/hidden content never advances. */
export function useCityAutoplay(
  root: RefObject<HTMLElement | null>,
  enabled: boolean,
  advance: () => void,
  selection: number,
) {
  useEffect(() => {
    const section = root.current
    if (!section || !enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let visible = false
    const sync = () => {
      clearTimeout(timer)
      if (visible && !document.hidden) timer = setTimeout(advance, CITY_SLIDE_DELAY)
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
  }, [root, enabled, advance, selection])
}
