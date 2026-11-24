import { describe, expect, it } from 'vitest'
import { formatSubmissionReference, isSubmissionReference } from './submission-reference'

describe('submission reference', () => {
  it('formats VD-<n>', () => {
    expect(formatSubmissionReference(1)).toBe('VD-1')
    expect(formatSubmissionReference(1042)).toBe('VD-1042')
  })

  it('refuses a number that cannot be a reference', () => {
    for (const n of [0, -3, 1.5, Number.NaN, Infinity]) {
      expect(() => formatSubmissionReference(n), String(n)).toThrow(RangeError)
    }
  })

  it('recognises its own output only', () => {
    expect(isSubmissionReference(formatSubmissionReference(77))).toBe(true)
    for (const v of ['VD-', 'vd-1', 'VD-01', 'VD-1a', ' VD-1', 42, null]) {
      expect(isSubmissionReference(v), String(v)).toBe(false)
    }
  })
})
