import { describe, expect, it } from 'vitest'
import { nextWindowSize } from './import-window'

/**
 * How many listings the browser asks for at a time.
 *
 * # Why this small function has its own tests
 *
 * Because it is the only thing standing between the import and a function
 * timeout, and it is the piece that cannot be checked by using the feature in
 * development. The whole reason it exists is that development and production
 * are not alike: a window of five took 17.3 seconds against a database in
 * Frankfurt from a laptop, and in production the function runs in us-east-1
 * with the database still in Frankfurt.
 *
 * So the properties below are asserted arithmetically. A test that ran an
 * import and passed would prove nothing about the deployment where this
 * matters.
 */

/** Netlify's default. The window must stay comfortably inside it. */
const FUNCTION_LIMIT_MS = 10_000

describe('nextWindowSize', () => {
  /**
   * The measurement that started all this. Five listings in 17.3 seconds is
   * 3.46 seconds each, so at most one fits in the budget.
   */
  it('shrinks to one when a listing takes over three seconds', () => {
    expect(nextWindowSize(5, 17_300)).toBe(1)
  })

  it('grows when listings are quick, but never more than doubles', () => {
    // 1 listing in 200ms could fit 30, but doubling caps it at 2.
    expect(nextWindowSize(1, 200)).toBe(2)
    expect(nextWindowSize(2, 400)).toBe(4)
    expect(nextWindowSize(4, 800)).toBe(8)
  })

  it('never asks for more than the endpoint would allow', () => {
    expect(nextWindowSize(25, 10)).toBeLessThanOrEqual(25)
    expect(nextWindowSize(20, 1)).toBeLessThanOrEqual(25)
  })

  it('never drops below one, whatever it measures', () => {
    for (const elapsed of [60_000, 600_000, Number.MAX_SAFE_INTEGER]) {
      expect(nextWindowSize(5, elapsed), String(elapsed)).toBe(1)
    }
  })

  it('does not divide by zero on an instant window', () => {
    expect(Number.isFinite(nextWindowSize(1, 0))).toBe(true)
    expect(nextWindowSize(1, 0)).toBeGreaterThanOrEqual(1)
  })

  /**
   * The property that actually matters, checked across a wide range of speeds
   * rather than at a few chosen points: whatever the last window measured, the
   * next one is predicted to finish inside the function's budget.
   *
   * A window of one is exempt. If a single listing cannot be written inside the
   * limit there is no smaller window to fall back to, and the honest answer is
   * that this deployment cannot import from the browser at all - which the
   * documentation says, pointing at the command line instead.
   */
  it('predicts a next window that fits inside the function limit', () => {
    for (let current = 1; current <= 25; current += 1) {
      for (const perListing of [5, 50, 200, 500, 1_000, 2_000, 3_460, 8_000]) {
        const next = nextWindowSize(current, current * perListing)
        if (next === 1) continue

        expect(
          next * perListing,
          `${current} at ${perListing}ms each -> window of ${next}`,
        ).toBeLessThan(FUNCTION_LIMIT_MS)
      }
    }
  })

  /**
   * The failure mode the doubling cap exists for. One unusually fast window -
   * a run of listings that already existed and were skipped - must not launch
   * the next one straight into a timeout.
   */
  it('cannot leap from a fast window to a window that would time out', () => {
    const afterFluke = nextWindowSize(2, 20)
    expect(afterFluke).toBeLessThanOrEqual(4)
  })
})
