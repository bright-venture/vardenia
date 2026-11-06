import { describe, expect, it } from 'vitest'
import { dragProgress, pageFold, shouldCommitTurn, type Point } from './reader-curl'

/** Area of a polygon, by the shoelace formula. */
const area = (points: Point[]) =>
  Math.abs(
    points.reduce((sum, a, i) => {
      const b = points[(i + 1) % points.length]!
      return sum + a.x * b.y - b.x * a.y
    }, 0) / 2,
  )

const W = 600
const H = 800

describe('the page fold', () => {
  it('lies flat and covers exactly its own page at rest', () => {
    const fold = pageFold(0, W, H)
    expect(area(fold.front)).toBeCloseTo(W * H)
    expect(fold.flap).toHaveLength(0)
  })

  it('ends exactly on the far side of the spine', () => {
    const fold = pageFold(1, W, H)
    expect(area(fold.front)).toBeCloseTo(0)
    expect(area(fold.flap)).toBeCloseTo(W * H)
    for (const point of fold.flap) {
      expect(point.x).toBeLessThanOrEqual(0.001)
      expect(point.x).toBeGreaterThanOrEqual(-W - 0.001)
    }
  })

  /**
   * The bug this replaced: a page rotating in 3D stood edge-on half way and
   * vanished. A folded page is always there: what lies flat plus the flap
   * showing its back never falls far below a whole page.
   */
  it('stays visible through the whole turn, never vanishing in the middle', () => {
    for (let step = 1; step < 20; step++) {
      const fold = pageFold(step / 20, W, H)
      const visible = area(fold.front) + area(fold.flap)
      expect(visible, `at ${step / 20}`).toBeGreaterThan(W * H * 0.95)
      // Paper does not stretch: the lifted part and its flap are the same size.
      expect(area(fold.flap)).toBeCloseTo(area(fold.lifted), 3)
      expect(area(fold.front) + area(fold.lifted)).toBeCloseTo(W * H, 3)
    }
  })

  it('carries the corner steadily across, without tearing it from the spine', () => {
    let previous = Infinity
    for (let step = 0; step <= 20; step++) {
      const { corner } = pageFold(step / 20, W, H, 0.9)
      expect(corner.x).toBeLessThanOrEqual(previous + 0.001)
      expect(Math.hypot(corner.x, corner.y - H)).toBeLessThanOrEqual(W + 0.001)
      previous = corner.x
    }
  })

  it('lifts the corner in an arc, and folds the top corner when the page is taken high', () => {
    const low = pageFold(0.5, W, H, 0.9)
    expect(low.from).toEqual({ x: W, y: H })
    expect(low.corner.y).toBeLessThan(H)
    const high = pageFold(0.5, W, H, 0.1)
    expect(high.from).toEqual({ x: W, y: 0 })
    expect(high.corner.y).toBeGreaterThan(0)
  })
})

describe('dragging a page', () => {
  it('clamps drag progress and distinguishes short drags from committed flicks', () => {
    expect(dragProgress(600, 100, 600, 1)).toBeCloseTo(0.5208, 3)
    expect(dragProgress(100, 600, 600, -1)).toBeCloseTo(0.5208, 3)
    expect(dragProgress(100, 600, 600, 1)).toBe(0)
    expect(dragProgress(600, -2000, 600, 1)).toBe(1)
    expect(shouldCommitTurn(0.1, 0.1, 90)).toBe(false)
    expect(shouldCommitTurn(0.4, 0, 300)).toBe(true)
    expect(shouldCommitTurn(0.1, 0.8, 50)).toBe(true)
    expect(shouldCommitTurn(0.1, 0.8, 10)).toBe(false)
  })
})
