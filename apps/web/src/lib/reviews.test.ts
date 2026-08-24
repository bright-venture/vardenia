import { describe, expect, it } from 'vitest'
import {
  aggregateRating,
  editorialVerdict,
  forDisplay,
  type ReviewSummary,
} from './reviews'

/**
 * The rules under test are the ones with a consequence outside the codebase.
 *
 * Aggregating an editorial review into a public star rating is a structured
 * data violation that costs rich results for the whole domain, and showing a
 * business's own supplied quote at the top of its page is the thing that makes
 * a directory worthless. Both are one careless filter away, which is why they
 * are pinned here rather than trusted to the comment that explains them.
 */

const review = (over: Partial<ReviewSummary> = {}): ReviewSummary => ({
  id: Math.random(),
  source: 'guest',
  rating: 4,
  title: 'A title',
  body: 'A body',
  ...over,
})

describe('aggregateRating', () => {
  it('averages guest reviews', () => {
    const result = aggregateRating([
      review({ rating: 5 }),
      review({ rating: 4 }),
      review({ rating: 3 }),
    ])
    expect(result).toEqual({ value: 4, count: 3 })
  })

  it('rounds to one decimal, which is all a mean of integers can carry', () => {
    const result = aggregateRating([review({ rating: 5 }), review({ rating: 4 })])
    expect(result).toEqual({ value: 4.5, count: 2 })
  })

  /**
   * The important one. Google permits a publisher's own critic review as a
   * `Review`; it does not permit that review inside an `aggregateRating`.
   */
  it('never counts an editorial review towards the average', () => {
    const result = aggregateRating([
      review({ source: 'editorial', rating: 5 }),
      review({ source: 'guest', rating: 3 }),
    ])
    expect(result).toEqual({ value: 3, count: 1 })
  })

  it('never counts a partner supplied quote towards the average', () => {
    const result = aggregateRating([
      review({ source: 'partner', rating: 5 }),
      review({ source: 'guest', rating: 2 }),
    ])
    expect(result).toEqual({ value: 2, count: 1 })
  })

  /**
   * Null and not zero. A listing with no guest reviews has no rating, which is
   * a different claim from a rating of zero - and rendering zero stars against
   * a real business is a statement we cannot support.
   */
  it('returns null rather than zero when nothing is aggregatable', () => {
    expect(aggregateRating([])).toBeNull()
    expect(aggregateRating([review({ source: 'editorial', rating: 5 })])).toBeNull()
    expect(aggregateRating([review({ source: 'partner', rating: 5 })])).toBeNull()
  })
})

describe('editorialVerdict', () => {
  it('picks the editorial review and ignores the others', () => {
    const verdict = editorialVerdict([
      review({ source: 'guest', title: 'Guest' }),
      review({ source: 'editorial', title: 'Ours' }),
    ])
    expect(verdict?.title).toBe('Ours')
  })

  it('prefers the most recent visit, because a place changes', () => {
    const verdict = editorialVerdict([
      review({ source: 'editorial', title: 'Old', visitedAt: '2023-01-01' }),
      review({ source: 'editorial', title: 'New', visitedAt: '2026-01-01' }),
    ])
    expect(verdict?.title).toBe('New')
  })

  it('falls back to the published date when there is no visit date', () => {
    const verdict = editorialVerdict([
      review({ source: 'editorial', title: 'Old', publishedAt: '2023-01-01' }),
      review({ source: 'editorial', title: 'New', publishedAt: '2026-01-01' }),
    ])
    expect(verdict?.title).toBe('New')
  })

  it('is null when nobody has been', () => {
    expect(editorialVerdict([review({ source: 'guest' })])).toBeNull()
  })
})

describe('forDisplay', () => {
  it('pins the featured review to the top', () => {
    const order = forDisplay([
      review({ title: 'Ordinary', publishedAt: '2026-01-01' }),
      review({ title: 'Pinned', featured: true, publishedAt: '2020-01-01' }),
    ]).map((r) => r.title)

    expect(order[0]).toBe('Pinned')
  })

  /**
   * A quote the business wrote about itself is the least disinterested thing
   * on the page, so it cannot be the first thing a reader sees - even if it is
   * the newest and even if somebody ticked featured on it.
   */
  it('sinks a partner quote below everything, featured or not', () => {
    const order = forDisplay([
      review({ source: 'partner', title: 'Theirs', featured: true, publishedAt: '2026-06-01' }),
      review({ source: 'guest', title: 'Guest', publishedAt: '2020-01-01' }),
      review({ source: 'editorial', title: 'Ours', publishedAt: '2019-01-01' }),
    ]).map((r) => r.title)

    expect(order[order.length - 1]).toBe('Theirs')
  })

  it('orders the rest newest first', () => {
    const order = forDisplay([
      review({ title: 'Older', publishedAt: '2024-01-01' }),
      review({ title: 'Newer', publishedAt: '2026-01-01' }),
    ]).map((r) => r.title)

    expect(order).toEqual(['Newer', 'Older'])
  })

  it('does not mutate what it was given', () => {
    const input = [review({ title: 'A' }), review({ source: 'partner', title: 'B' })]
    const before = input.map((r) => r.title)
    forDisplay(input)
    expect(input.map((r) => r.title)).toEqual(before)
  })
})
