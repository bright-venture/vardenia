import { describe, expect, it } from 'vitest'
import {
  blockNumbers,
  blockProblem,
  blocksOverlap,
  buildSlots,
  templateTotals,
} from '@vardenia/core'
import {
  GOVERNORATES,
  PLACEHOLDER_PRICES,
  SAMPLE_ISSUE_NUMBER,
  SAMPLE_ISSUE_TITLE,
  SAMPLE_PAGES,
  planBlocks,
  sampleIssuePlan,
} from './page-layouts-plan'

describe('sample template', () => {
  it('is about 100 pages with a few hundred listings, a spread first', () => {
    const totals = templateTotals(SAMPLE_PAGES)
    expect(totals).toEqual({ pages: 100, listings: 251 })
    expect(SAMPLE_PAGES[0]?.layout).toBe('full-spread')
  })

  it('has a placeholder price for every layout, all offered', () => {
    expect(PLACEHOLDER_PRICES.map((p) => [p.layout, p.price])).toEqual([
      ['full-spread', 3000],
      ['full-page', 1500],
      ['half-page', 800],
      ['three-third', 600],
      ['quarter-page', 300],
    ])
    expect(PLACEHOLDER_PRICES.every((p) => p.offered)).toBe(true)
  })
})

describe('planBlocks', () => {
  const slots = buildSlots(SAMPLE_PAGES)
  const blocks = planBlocks(slots, 100)

  it('gives each of the seven governorates a block, covering every page once', () => {
    expect(blocks.map((b) => b.governorate)).toEqual([...GOVERNORATES])
    expect(blocks[0]?.firstPage).toBe(1)
    expect(blocks.at(-1)?.lastPage).toBe(100)
    blocks.slice(1).forEach((b, i) => expect(b.firstPage).toBe((blocks[i]?.lastPage ?? 0) + 1))
    expect(blocksOverlap(blocks)).toBeNull()
  })

  it('cuts no spread and every block holds listings', () => {
    for (const b of blocks) {
      expect(blockProblem(slots, b, 100)).toBeNull()
      expect(blockNumbers(slots, b)).not.toBeNull()
    }
  })

  it('moves an edge that would cut a spread', () => {
    // 4 spreads over 8 pages, 2 blocks: the even edge (page 4) is inside a spread.
    const spreads = buildSlots(
      Array.from({ length: 4 }, () => ({ layout: 'full-spread' as const })),
    )
    const split = planBlocks(spreads, 8, ['a', 'b', 'c'])
    for (const b of split) expect(blockProblem(spreads, b, 8)).toBeNull()
  })
})

describe('the sample issue', () => {
  it('is its own issue, clearly a test one, with a number far from real issues', () => {
    expect(SAMPLE_ISSUE_TITLE).toBe('Sample issue (test values)')
    expect(Number.isInteger(SAMPLE_ISSUE_NUMBER)).toBe(true)
    expect(SAMPLE_ISSUE_NUMBER).toBeGreaterThanOrEqual(9000)
  })
})

describe('sampleIssuePlan', () => {
  const fresh = { template: 'none', hasPrices: false, rangeCount: 0, heldCount: 0 } as const

  it('creates the issue, then links the template, sets prices and blocks, when none exists', () => {
    expect(sampleIssuePlan(null, null)).toEqual({
      create: true,
      link: true,
      prices: true,
      blocks: true,
    })
  })

  it('never takes the issue number of another issue', () => {
    expect(sampleIssuePlan(null, 'Summer 2027')).toEqual({
      skip: expect.stringMatching(/9001 is already used by "Summer 2027"/),
    })
  })

  it('finishes a sample issue an earlier run left without a template', () => {
    expect(sampleIssuePlan(fresh, null)).toEqual({
      create: false,
      link: true,
      prices: true,
      blocks: true,
    })
  })

  it('finishes one already linked to the sample template, never overwriting its prices', () => {
    expect(sampleIssuePlan({ ...fresh, template: 'sample', hasPrices: true }, null)).toEqual({
      create: false,
      link: false,
      prices: false,
      blocks: true,
    })
    expect(sampleIssuePlan({ ...fresh, template: 'sample' }, null)).toMatchObject({ prices: true })
  })

  it('leaves it alone once it has blocks, another template, or held numbers', () => {
    expect(sampleIssuePlan({ ...fresh, template: 'sample', rangeCount: 7 }, null)).toEqual({
      skip: expect.stringMatching(/7 listing range/),
    })
    expect(sampleIssuePlan({ ...fresh, rangeCount: 2 }, null)).toEqual({
      skip: expect.stringMatching(/range/),
    })
    expect(sampleIssuePlan({ ...fresh, template: 'other' }, null)).toEqual({
      skip: expect.stringMatching(/another template/),
    })
    expect(sampleIssuePlan({ ...fresh, heldCount: 2 }, null)).toEqual({
      skip: expect.stringMatching(/hold a number/),
    })
  })
})
