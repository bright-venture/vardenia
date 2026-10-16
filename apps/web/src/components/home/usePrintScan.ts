'use client'
import { useCallback, useEffect, useState, type RefObject } from 'react'

export const PRINT_SCAN_DELAYS = [1000, 2400, 1500] as const
export type ScanPhase = 0 | 1 | 2 | 3

/** A camera demonstration only: no camera permission or navigation is triggered. */
export function usePrintScan(root: RefObject<HTMLElement | null>, enabled: boolean) {
  const [phase, setPhase] = useState<ScanPhase>(0)
  const [replayKey, setReplayKey] = useState(0)
  const replay = useCallback(() => {
    setPhase(0)
    setReplayKey((value) => value + 1)
  }, [])
  const reveal = useCallback(() => setPhase(3), [])
  useEffect(() => {
    const phone = root.current?.querySelector('#vd-print-page')
    if (!enabled || !phone || phase === 3) return
    let visible = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const sync = () => {
      clearTimeout(timer)
      if (visible && !document.hidden) {
        timer = setTimeout(
          () => setPhase((current) => Math.min(3, current + 1) as ScanPhase),
          PRINT_SCAN_DELAYS[phase],
        )
      }
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry && entry.intersectionRatio >= 0.35)
        sync()
      },
      { threshold: [0, 0.35] },
    )
    observer.observe(phone)
    document.addEventListener('visibilitychange', sync)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [root, enabled, phase, replayKey])
  return { phase: enabled ? phase : 3, replay, reveal } as const
}
