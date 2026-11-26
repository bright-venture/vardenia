import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LISTING_TOTAL,
  LISTING_GOVERNORATES,
  LISTING_NUMBER_MIN,
  allocatedCount,
  isInRange,
  nextFreeNumber,
  numbersIn,
  orphanedNumbers,
  rangeProblem,
  totalProblem,
  type NumberRange,
} from './listing-numbers'

const keserwan: NumberRange = { governorate: 'keserwan', from: 1, to: 90 }
const north: NumberRange = { governorate: 'north-lebanon', from: 91, to: 150 }

describe('constants', () => {
  it('has the agreed bounds and governorates', () => {
    expect(LISTING_NUMBER_MIN).toBe(1)
    expect(DEFAULT_LISTING_TOTAL).toBe(408)
    expect(LISTING_GOVERNORATES).toHaveLength(7)
  })
})

describe('rangeProblem', () => {
  it('accepts a free range', () => {
    expect(rangeProblem(keserwan, [], 408)).toBeNull()
  })

  it('names the governorate it overlaps', () => {
    const clash = { governorate: 'north-lebanon', from: 80, to: 150 }
    const text = rangeProblem(clash, [keserwan], 408)
    expect(text).toContain('overlaps')
    expect(text).toContain('keserwan')
  })

  it('rejects from > to, from < 1 and to > total', () => {
    expect(rangeProblem({ ...keserwan, from: 10, to: 5 }, [], 408)).not.toBeNull()
    expect(rangeProblem({ ...keserwan, from: 0, to: 5 }, [], 408)).not.toBeNull()
    expect(rangeProblem({ ...keserwan, from: 400, to: 409 }, [], 408)).not.toBeNull()
  })

  it('ignores the same governorate in others (editing its own range)', () => {
    expect(rangeProblem({ ...keserwan, to: 95 }, [keserwan], 408)).toBeNull()
  })
})

describe('nextFreeNumber', () => {
  it('continues after the highest range', () => {
    expect(nextFreeNumber([keserwan])).toBe(91)
    expect(nextFreeNumber([])).toBe(1)
  })
})

describe('helpers', () => {
  it('counts allocated numbers', () => {
    expect(allocatedCount([keserwan, north])).toBe(150)
  })

  it('lists and tests range members', () => {
    expect(numbersIn({ governorate: 'beirut', from: 3, to: 5 })).toEqual([3, 4, 5])
    expect(isInRange(90, keserwan)).toBe(true)
    expect(isInRange(91, keserwan)).toBe(false)
  })

  it('refuses a fraction, even inside the range', () => {
    expect(isInRange(1.5, keserwan)).toBe(false)
    expect(isInRange(Number.NaN, keserwan)).toBe(false)
  })

  it('finds held numbers outside a range', () => {
    expect(orphanedNumbers([5, 95], keserwan)).toEqual([95])
  })
})

describe('totalProblem', () => {
  it('refuses a total below the highest number in use', () => {
    expect(totalProblem(100, 150)).not.toBeNull()
    expect(totalProblem(408, 150)).toBeNull()
  })
})
