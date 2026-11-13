'use client'

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type RefObject } from 'react'
import {
  PAPER_RETURN_MS,
  PAPER_TURN_MS,
  clampProgress,
  pageFold,
  type PageFold,
  type Point,
} from './reader-curl'
import { colors } from '@vardenia/tokens'
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

/** The colour of the paper where a page has not rendered yet. */
const PAPER = colors.surface.base

/** A palette colour at some opacity, for the canvas: shadows in ink, light in paper. */
function tint(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}
const SHADE = colors.ink[950]
const LIGHT = colors.surface.base

function path(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath()
  points.forEach((point, index) =>
    index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
  )
  ctx.closePath()
}

/**
 * Draws a page snapshot across the turning page's own [0, width] x [0, height].
 * `mirrored` reverses it left to right: a page seen from its other side.
 */
function drawPage(
  ctx: CanvasRenderingContext2D,
  snapshot: PaperSnapshot | undefined,
  width: number,
  height: number,
  mirrored: boolean,
) {
  ctx.save()
  if (mirrored) {
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
  }
  if (snapshot) ctx.drawImage(snapshot.canvas, 0, 0, width, height)
  else {
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, width, height)
  }
  ctx.restore()
}

/**
 * One frame of the fold, in the turning page's coordinates (see reader-curl).
 *
 * In order: the page still lying flat, with a shadow deepening into the
 * crease; the page uncovered beneath the lift, darkened where the flap hangs
 * over it; then the flap, which casts its own soft shadow, shows the back of
 * the page (the next page, mirrored as paper is), and carries light across its
 * curl: shade in the crease, a highlight where it bends, a little shade again
 * at its free edge.
 */
function drawFold(
  ctx: CanvasRenderingContext2D,
  fold: PageFold,
  width: number,
  height: number,
  front: PaperSnapshot,
  back: PaperSnapshot | undefined,
  forward: boolean,
  strength: number,
) {
  const { crease, normal } = fold
  const along = (distance: number) => ({
    x: crease.x + normal.x * distance,
    y: crease.y + normal.y * distance,
  })

  if (fold.front.length >= 3) {
    ctx.save()
    path(ctx, fold.front)
    ctx.clip()
    drawPage(ctx, front, width, height, !forward)
    if (fold.lifted.length >= 3) {
      const depth = Math.min(width * 0.18, 90)
      const end = along(-depth)
      const crease_ = ctx.createLinearGradient(crease.x, crease.y, end.x, end.y)
      crease_.addColorStop(0, tint(SHADE, 0.32 * strength))
      crease_.addColorStop(1, tint(SHADE, 0))
      ctx.fillStyle = crease_
      ctx.fillRect(-width, -height, width * 3, height * 3)
    }
    ctx.restore()
  }

  if (fold.lifted.length < 3) return

  // The page coming into view under the lifted part: the next spread itself is
  // drawn by the reader below this canvas, so only its shadow is painted here.
  ctx.save()
  path(ctx, fold.lifted)
  ctx.clip()
  const reach = Math.min(width * 0.45, Math.max(40, fold.flapDepth * 0.9))
  const shadowEnd = along(reach)
  const under = ctx.createLinearGradient(crease.x, crease.y, shadowEnd.x, shadowEnd.y)
  under.addColorStop(0, tint(SHADE, 0.45 * strength))
  under.addColorStop(0.35, tint(SHADE, 0.14 * strength))
  under.addColorStop(1, tint(SHADE, 0))
  ctx.fillStyle = under
  ctx.fillRect(-width, -height, width * 3, height * 3)
  ctx.restore()

  // The flap: its shadow first, then the back of the page across it.
  ctx.save()
  ctx.shadowColor = tint(SHADE, 0.4 * strength)
  ctx.shadowBlur = 28 * strength
  ctx.shadowOffsetX = -normal.x * 6 * strength
  ctx.shadowOffsetY = -normal.y * 6 * strength
  path(ctx, fold.flap)
  ctx.fillStyle = PAPER
  ctx.fill()
  ctx.restore()

  ctx.save()
  path(ctx, fold.flap)
  ctx.clip()
  // Reflect across the crease, so the lifted part of the page lands on the flap.
  const a = 1 - 2 * normal.x * normal.x
  const b = -2 * normal.x * normal.y
  const d = 1 - 2 * normal.y * normal.y
  const offset = 2 * (crease.x * normal.x + crease.y * normal.y)
  ctx.save()
  ctx.transform(a, b, b, d, offset * normal.x, offset * normal.y)
  // The back of a forward page is the next spread's left page, seen mirrored
  // from this side; turning back it is the right page, the right way round.
  drawPage(ctx, back, width, height, forward)
  ctx.restore()
  const depth = Math.max(1, fold.flapDepth)
  const edge = along(-depth)
  const light = ctx.createLinearGradient(crease.x, crease.y, edge.x, edge.y)
  light.addColorStop(0, tint(SHADE, 0.28 * strength))
  light.addColorStop(0.06, tint(LIGHT, 0.22 * strength))
  light.addColorStop(0.3, tint(LIGHT, 0.06 * strength))
  light.addColorStop(0.75, tint(SHADE, 0.05 * strength))
  light.addColorStop(1, tint(SHADE, 0.16 * strength))
  ctx.fillStyle = light
  ctx.fillRect(-width * 2, -height, width * 4, height * 3)
  ctx.restore()
}

/** Reuses bounded snapshots; only the fold changes while dragging or animating. */
export function PaperCurl({
  turn,
  onFinish,
}: {
  turn: PaperTurn
  onFinish: (returned: boolean) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
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
  // A lone page opening into a spread (the cover, or a lone back page turned
  // back) lands on the side where no page is yet, so the canvas is a whole
  // spread wide; otherwise the landing half would be cut off at the spine.
  const opens = turn.pages.length === 1 && turn.toPages.length === 2
  const bookWidth = opens ? sheet.width * 2 : turn.pages.reduce((sum, item) => sum + item.width, 0)
  const spine = forward ? bookWidth - sheet.width : sheet.width
  const back = turn.back
  useLayoutEffect(() => {
    const element = root.current
    const target = canvas.current
    if (!element || !target) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    target.width = Math.max(1, Math.round(bookWidth * ratio))
    target.height = Math.max(1, Math.round(sheet.height * ratio))
    const ctx = target.getContext('2d')
    const paint = (value: number) => {
      const p = clampProgress(value)
      progress.current = p
      element.dataset.paperProgress = p.toFixed(3)
      // The book below follows the same progress when a lone cover opens into a
      // spread, or a spread closes onto one (MagazineReader's bookShift).
      element.parentElement?.style.setProperty('--paper-progress', p.toFixed(4))
      // The book recentres by half a page as a lone page opens or a spread
      // closes; a canvas widened for an opening page starts that half page
      // further back, so the lone page sits where it was.
      const centering =
        turn.fromPages.length !== turn.toPages.length
          ? (turn.direction * sheet.width * p) / 2 -
            (opens ? (turn.direction * sheet.width) / 2 : 0)
          : 0
      element.style.transform = `translateX(calc(-50% + ${centering}px))`
      element.style.opacity =
        turn.fromPages.length === 1 && turn.toPages.length === 1
          ? String(Math.min(1, (1 - p) / 0.06))
          : '1'
      // A test double, or a browser without 2D canvas: the reader still turns.
      if (!ctx || typeof ctx.setTransform !== 'function') return
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, bookWidth, sheet.height)
      if (still) {
        ctx.globalAlpha = 1 - Math.max(0, (p - 0.94) / 0.06)
        ctx.drawImage(still.canvas, forward ? 0 : sheet.width, 0, still.width, still.height)
        ctx.globalAlpha = 1
      }
      // Into the turning page's own coordinates: spine at 0, page towards +x.
      ctx.translate(spine, 0)
      if (!forward) ctx.scale(-1, 1)
      const fold = pageFold(p, sheet.width, sheet.height, turn.grabY)
      const strength = Math.min(1, Math.sin(Math.PI * p) * 1.6)
      drawFold(ctx, fold, sheet.width, sheet.height, sheet, back, forward, strength)
    }
    paintRef.current = paint
    paint(progress.current)
    return () => {
      paintRef.current = null
    }
  }, [
    sheet,
    still,
    back,
    spine,
    bookWidth,
    forward,
    turn.direction,
    turn.grabY,
    turn.fromPages.length,
    turn.toPages.length,
    opens,
  ])
  useEffect(() => {
    if (turn.phase !== 'turning' && turn.phase !== 'returning') return
    const returning = turn.phase === 'returning'
    const start = turn.control.current?.progress ?? turn.initialProgress
    const end = returning ? 0 : 1
    const duration = returning ? PAPER_RETURN_MS : Math.max(260, PAPER_TURN_MS * (1 - start))
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
      // Lifts gently, crosses quickly, settles softly; a return just eases out.
      const eased = returning
        ? 1 - (1 - elapsed) ** 3
        : elapsed < 0.5
          ? 4 * elapsed ** 3
          : 1 - (-2 * elapsed + 2) ** 3 / 2
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
      style={{ width: bookWidth, height: sheet.height }}
    >
      <canvas
        ref={canvas}
        data-paper-canvas
        className={styles.canvas}
        style={{ width: bookWidth, height: sheet.height }}
      />
    </div>
  )
}
