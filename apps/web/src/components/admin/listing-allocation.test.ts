import { describe, expect, it } from 'vitest'
import { allocationSummary } from './listing-allocation'

const range = (governorate: string, from: number, to: number) => ({ governorate, from, to })

describe('allocationSummary', () => {
  it('reads an issue with no ranges as nothing allocated, starting at 1', () => {
    expect(allocationSummary([], null)).toEqual({
      allocated: 0,
      total: 408,
      next: 1,
      state: 'open',
      text: '0 of 408 allocated, next free number 1',
    })
  })

  it('counts the numbers in the blocks and points past the highest', () => {
    const s = allocationSummary([range('keserwan', 1, 90)], 408)
    expect(s.allocated).toBe(90)
    expect(s.next).toBe(91)
    expect(s.text).toBe('90 of 408 allocated, next free number 91')
  })

  it('uses the issue total when it has one, not the default', () => {
    expect(allocationSummary([range('beirut', 1, 10)], 50).total).toBe(50)
  })

  it('says all numbers are allocated when the blocks fill the total', () => {
    const s = allocationSummary([range('keserwan', 1, 200), range('matn', 201, 408)], null)
    expect(s.state).toBe('full')
    expect(s.text).toBe('408 of 408 allocated, all numbers allocated')
  })

  it('does not say full while a gap is left below the highest block', () => {
    const s = allocationSummary([range('keserwan', 1, 10), range('matn', 21, 408)], 408)
    expect(s.state).toBe('open')
    expect(s.allocated).toBe(398)
  })
})
