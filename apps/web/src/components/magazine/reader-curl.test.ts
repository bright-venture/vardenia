import { describe, expect, it } from 'vitest'
import { dragProgress, paperGeometry, shouldCommitTurn } from './reader-curl'

describe('flexible paper geometry', () => {
  it('lies flat and exactly covers the original sheet at rest', () => {
    const strips = paperGeometry(0, 600, 800, 1, 0.5, 40)
    expect(strips).toHaveLength(40)
    strips.forEach((strip, index) => {
      expect(strip.x).toBeCloseTo(index * 15)
      expect(strip.z).toBe(0)
      expect(strip.angle).toBeCloseTo(0)
      expect(strip.shadeStart).toBe(0)
    })
  })
  it('ends flat on the opposite side of the fixed spine', () => {
    for (const direction of [1, -1] as const) {
      const strips = paperGeometry(1, 600, 800, direction, 0.8, 40)
      expect(strips.every((strip) => Math.abs(strip.z) < 0.0001)).toBe(true)
      expect(Math.abs(strips[0]!.angle)).toBeCloseTo(Math.PI)
      expect(Math.abs(strips[39]!.angle)).toBeCloseTo(Math.PI)
    }
  })
  it('creates a smooth curve instead of a rigid two-panel hinge', () => {
    const strips = paperGeometry(0.45, 600, 800, 1, 0.8, 40)
    const distinctAngles = new Set(strips.map((strip) => strip.angle))
    expect(distinctAngles.size).toBe(40)
    expect(Math.max(...strips.map((strip) => strip.z))).toBeGreaterThan(300)
    strips.slice(1).forEach((strip, i) => {
      const previous = strips[i]!
      expect(strip.x).toBeCloseTo(previous.x + Math.cos(previous.angle) * 15)
      expect(strip.z).toBeCloseTo(previous.z - Math.sin(previous.angle) * 15)
      expect(Math.abs(strip.angle - previous.angle)).toBeLessThan(0.06)
    })
  })
  it('mirrors backward turns and uses the pointer height to lift the outer corner', () => {
    const forward = paperGeometry(0.5, 600, 800, 1, 0.9, 40)
    const backward = paperGeometry(0.5, 600, 800, -1, 0.1, 40)
    expect(forward[39]!.y).toBeGreaterThan(0)
    expect(backward[39]!.y).toBeLessThan(0)
    expect(forward[0]!.sourceIndex).toBe(0)
    expect(backward[0]!.sourceIndex).toBe(39)
  })
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
