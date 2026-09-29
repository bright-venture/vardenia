import { describe, expect, it } from 'vitest'
import { reviewHighlights, type PublicReview } from './reviews'

const review = (id: number, rating: number, body: string): PublicReview => ({
  id,
  authorName: `Guest ${id}`,
  rating,
  title: null,
  body,
  createdAt: '2026-09-01T00:00:00Z',
})

describe('reviewHighlights', () => {
  it('quotes the first sentence of the good reviews, most recent first', () => {
    const quotes = reviewHighlights([
      review(1, 5, 'Beautiful rooms and warm service. We will be back.'),
      review(2, 2, 'Too noisy at night, sadly.'),
      review(3, 4, 'Great breakfast on the terrace! Parking was easy.'),
      review(4, 5, 'Would come again for the view alone.'),
    ])
    expect(quotes.map((q) => q.quote)).toEqual([
      'Beautiful rooms and warm service.',
      'Great breakfast on the terrace!',
    ])
  })

  it('cuts a long sentence at a word, never inside one', () => {
    const long = `The view ${'over the whole bay '.repeat(12)}was unforgettable`
    const [quote] = reviewHighlights([review(1, 5, long)])
    expect(quote!.quote.length).toBeLessThanOrEqual(141)
    expect(quote!.quote.endsWith('…')).toBe(true)
    expect(quote!.quote).not.toMatch(/\s…$/)
  })

  it('offers nothing when no review is four stars or more', () => {
    expect(reviewHighlights([review(1, 3, 'It was fine.')])).toEqual([])
  })
})
