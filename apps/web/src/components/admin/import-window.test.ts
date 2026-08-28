import { describe, expect, it } from 'vitest'
import { LANES, MAX_WINDOW, nextWindowSize, WindowCursor } from './import-window'

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

/**
 * The cursor several lanes claim their work from.
 *
 * # What these are really testing
 *
 * That no listing is claimed twice and none is missed. Neither shows up as an
 * error at import time: a slug that already exists is skipped, so an overlap
 * produces a run that quietly does some of its work twice, reports more
 * listings processed than the file holds, and drives the progress bar past the
 * end. A gap is worse and quieter still - the run finishes looking successful
 * with listings missing, and the missing ones have no QR codes.
 *
 * So the properties are asserted over every interleaving these tests can
 * produce, rather than at a couple of chosen points.
 */
describe('WindowCursor', () => {
  /** Drains a cursor the way lanes would, with whatever window sizes are given. */
  const drain = (total: number, sizes: number[], from = 0) => {
    const cursor = new WindowCursor(total, from)
    const slices: { offset: number; limit: number }[] = []

    for (let index = 0; ; index += 1) {
      const slice = cursor.take(sizes[index % sizes.length] ?? 1)
      if (!slice) break
      slices.push(slice)
    }

    return slices
  }

  it('covers the file exactly once, whatever sizes the lanes ask for', () => {
    for (const total of [1, 2, 7, 25, 308, 1000]) {
      for (const sizes of [[1], [5], [25], [1, 5, 25], [3, 1, 8, 2], [25, 1]]) {
        const slices = drain(total, sizes)
        const seen: number[] = []

        for (const slice of slices) {
          for (let i = slice.offset; i < slice.offset + slice.limit; i += 1) seen.push(i)
        }

        const label = `total ${total}, sizes ${sizes.join('/')}`
        expect(seen, label).toEqual(Array.from({ length: total }, (_, i) => i))
        expect(new Set(seen).size, `${label} - overlap`).toBe(total)
      }
    }
  })

  /**
   * The lanes start after the warm-up window, which has already written the
   * first listing. Claiming from zero would send every lane over ground that is
   * already covered.
   */
  it('resumes from where the first window stopped', () => {
    expect(drain(10, [3], 1)).toEqual([
      { offset: 1, limit: 3 },
      { offset: 4, limit: 3 },
      { offset: 7, limit: 3 },
    ])
  })

  it('never hands out a slice that runs past the end', () => {
    const slices = drain(10, [25])

    expect(slices).toEqual([{ offset: 0, limit: 10 }])
  })

  it('returns null once the file is claimed, and keeps returning null', () => {
    const cursor = new WindowCursor(2)

    expect(cursor.take(5)).toEqual({ offset: 0, limit: 2 })
    expect(cursor.take(5)).toBeNull()
    expect(cursor.take(5)).toBeNull()
    expect(cursor.claimed).toBe(2)
  })

  it('has nothing to hand out for an empty file', () => {
    expect(new WindowCursor(0).take(5)).toBeNull()
    expect(new WindowCursor(3, 3).take(5)).toBeNull()
  })

  /**
   * A lane asking for a nonsense window still gets a usable slice rather than
   * an empty one, which would spin the lane forever without claiming anything.
   */
  it('always claims at least one listing while any remain', () => {
    for (const size of [0, -5, 0.4, Number.NaN]) {
      const slice = new WindowCursor(10).take(size)
      expect(slice, String(size)).not.toBeNull()
      expect(slice?.limit, String(size)).toBeGreaterThanOrEqual(1)
    }
  })

  /**
   * Interleaved rather than drained one lane at a time, because that is what
   * actually happens: three lanes take turns as their windows return.
   */
  it('keeps lanes off each other regardless of who asks when', () => {
    const total = 100
    const cursor = new WindowCursor(total)
    const lanes = [5, 3, 8]
    const seen = new Set<number>()
    let claims = 0

    for (let turn = 0; claims < total; turn += 1) {
      const slice = cursor.take(lanes[turn % lanes.length] ?? 1)
      if (!slice) break

      for (let i = slice.offset; i < slice.offset + slice.limit; i += 1) {
        expect(seen.has(i), `listing ${i} claimed twice`).toBe(false)
        seen.add(i)
      }

      claims += slice.limit
    }

    expect(seen.size).toBe(total)
  })
})

describe('LANES', () => {
  /**
   * Modest on purpose. Supabase's transaction pooler has a connection limit,
   * and each lane holds one for the length of its window; the aim is to stop
   * waiting rather than to saturate it.
   */
  it('is more than one and small enough not to fight the pooler', () => {
    expect(LANES).toBeGreaterThan(1)
    expect(LANES).toBeLessThanOrEqual(4)
  })

  /**
   * A lane never asks for more than the endpoint would give it. The two
   * constants agree today because import-window owns both; this is here so that
   * raising one without the other is caught rather than silently clamped, which
   * would make the window sizing lie to itself about what it just measured.
   */
  it('sizes its windows within what the endpoint allows', () => {
    for (let current = 1; current <= MAX_WINDOW; current += 1) {
      expect(nextWindowSize(current, 1)).toBeLessThanOrEqual(MAX_WINDOW)
    }
  })
})
