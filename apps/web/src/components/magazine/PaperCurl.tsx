'use client'

import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type RefObject,
} from 'react'
import { PAPER_RETURN_MS, PAPER_TURN_MS, clampProgress, paperGeometry } from './reader-curl'
import styles from './PaperCurl.module.css'

export interface PaperSnapshot {
  canvas: HTMLCanvasElement
  width: number
  height: number
}
export interface PaperControl {
  progress: number
  paint?: (progress: number) => void
}
export interface PaperTurn {
  id: number
  direction: 1 | -1
  pages: PaperSnapshot[]
  fromPages: number[]
  toPages: number[]
  phase: 'waiting' | 'turning' | 'dragging' | 'returning'
  ready: boolean
  initialProgress: number
  grabY: number
  control: RefObject<PaperControl | null>
  back?: PaperSnapshot
}

function Raster({
  snapshot,
  index = 0,
  count = 1,
}: {
  snapshot: PaperSnapshot
  index?: number
  count?: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const target = canvas.current
    if (!target) return
    const sourceX = Math.floor((snapshot.canvas.width * index) / count)
    // A one-pixel overlap prevents compositor hairlines between adjacent curved strips.
    const endX = Math.min(
      snapshot.canvas.width,
      Math.ceil((snapshot.canvas.width * (index + 1)) / count) + 1,
    )
    const sourceWidth = Math.max(1, endX - sourceX)
    target.width = sourceWidth
    target.height = snapshot.canvas.height
    target
      .getContext('2d')
      ?.drawImage(
        snapshot.canvas,
        sourceX,
        0,
        sourceWidth,
        snapshot.canvas.height,
        0,
        0,
        sourceWidth,
        snapshot.canvas.height,
      )
  }, [snapshot, index, count])
  return <canvas ref={canvas} />
}

/** Reuses bounded snapshots; only transforms and light change while dragging/animating. */
export function PaperCurl({
  turn,
  onFinish,
}: {
  turn: PaperTurn
  onFinish: (returned: boolean) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const progress = useRef(turn.initialProgress)
  const paintRef = useRef<((value: number) => void) | null>(null)
  useImperativeHandle(
    turn.control,
    () => ({
      get progress() {
        return progress.current
      },
      paint(value: number) {
        paintRef.current?.(value)
      },
    }),
    [],
  )
  const forward = turn.direction > 0
  const sheet = (forward ? turn.pages[turn.pages.length - 1] : turn.pages[0])!
  const still = turn.pages.length === 2 ? (forward ? turn.pages[0] : turn.pages[1]) : null
  const count = sheet.width < 440 ? 28 : 40
  const bookWidth = turn.pages.reduce((sum, item) => sum + item.width, 0)
  const spine = forward ? bookWidth - sheet.width : sheet.width
  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const strips = Array.from(element.querySelectorAll<HTMLElement>('[data-paper-strip]'))
    const shadow = element.querySelector<HTMLElement>('[data-paper-shadow]')
    const stationary = element.querySelector<HTMLElement>('[data-paper-still]')
    const paint = (value: number) => {
      const p = clampProgress(value)
      progress.current = p
      element.dataset.paperProgress = p.toFixed(3)
      const centering =
        turn.fromPages.length !== turn.toPages.length ? (turn.direction * sheet.width * p) / 2 : 0
      element.style.transform = `translateX(calc(-50% + ${centering}px))`
      element.style.opacity =
        turn.fromPages.length === 1 && turn.toPages.length === 1
          ? String(Math.min(1, (1 - p) / 0.06))
          : '1'
      const geometry = paperGeometry(
        p,
        sheet.width,
        sheet.height,
        turn.direction,
        turn.grabY,
        count,
      )
      geometry.forEach((strip, index) => {
        const target = strips[index]
        if (!target) return
        const angle = (strip.angle * 180) / Math.PI
        target.style.transform = `translate3d(${spine + strip.x}px, ${strip.y}px, ${strip.z}px) rotateY(${angle}deg) skewY(${(Math.atan(strip.shear) * 180) / Math.PI}deg)`
        target.style.setProperty('--shade-start', String(strip.shadeStart))
        target.style.setProperty('--shade-end', String(strip.shadeEnd))
      })
      const lift = Math.sin(Math.PI * p)
      if (shadow) {
        shadow.style.opacity = String(lift * 0.28)
        shadow.style.transform = `translateX(${spine - sheet.width * p * turn.direction}px) scaleX(${0.25 + lift * 0.75})`
        shadow.style.filter = `blur(${5 + lift * 14}px)`
      }
      if (stationary) stationary.style.opacity = String(1 - Math.max(0, (p - 0.92) / 0.08))
    }
    paintRef.current = paint
    paint(progress.current)
    return () => {
      paintRef.current = null
    }
  }, [sheet, spine, count, turn.direction, turn.grabY, turn.fromPages.length, turn.toPages.length])
  useEffect(() => {
    if (turn.phase !== 'turning' && turn.phase !== 'returning') return
    const returning = turn.phase === 'returning'
    const start = turn.control.current?.progress ?? turn.initialProgress
    const end = returning ? 0 : 1
    const duration = returning ? PAPER_RETURN_MS : Math.max(220, PAPER_TURN_MS * (1 - start))
    let frame = 0,
      started: number | undefined,
      finished = false
    const finish = () => {
      if (!finished) {
        finished = true
        turn.control.current?.paint?.(end)
        onFinish(returning)
      }
    }
    const animate = (time: number) => {
      started ??= time
      const elapsed = Math.min(1, (time - started) / duration)
      const eased = returning ? 1 - (1 - elapsed) ** 3 : elapsed * elapsed * (3 - 2 * elapsed)
      turn.control.current?.paint?.(start + (end - start) * eased)
      if (elapsed < 1) frame = requestAnimationFrame(animate)
      else finish()
    }
    frame = requestAnimationFrame(animate)
    // Finish safely in background tabs where rAF is suspended.
    const timer = window.setTimeout(finish, duration + 160)
    return () => {
      finished = true
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [turn.phase, turn.control, turn.initialProgress, onFinish])
  return (
    <div
      ref={root}
      className={styles.curl}
      data-reader-turn={turn.phase}
      aria-hidden="true"
      style={
        {
          width: bookWidth,
          height: sheet.height,
          '--leaf-width': `${sheet.width}px`,
        } as CSSProperties
      }
    >
      <div data-paper-shadow className={styles.shadow} />
      {still && (
        <div data-paper-still className={styles.still} style={{ left: forward ? 0 : sheet.width }}>
          <Raster snapshot={still} />
        </div>
      )}
      {Array.from({ length: count }, (_, index) => {
        const sourceIndex = forward ? index : count - 1 - index
        return (
          <div
            key={index}
            data-paper-strip
            className={styles.strip}
            style={{ width: sheet.width / count + 0.6 }}
          >
            <div className={styles.front}>
              <Raster snapshot={sheet} index={sourceIndex} count={count} />
            </div>
            <div className={styles.back}>
              {turn.back ? (
                <Raster snapshot={turn.back} index={count - 1 - sourceIndex} count={count} />
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
