import { describe, expect, it } from 'vitest'
import { SIMILARITY_THRESHOLD, bestFieldScore, normalizeForSearch, scoreMatch } from './search-text'

describe('normalizeForSearch', () => {
  it('lowercases and strips Latin accents', () => {
    expect(normalizeForSearch('Café')).toBe('cafe')
    expect(normalizeForSearch('LE GRAY')).toBe('le gray')
    expect(normalizeForSearch('Bécharré')).toBe('becharre')
  })

  it('collapses punctuation and whitespace to single spaces', () => {
    expect(normalizeForSearch('  Beit   Douma!  ')).toBe('beit douma')
    expect(normalizeForSearch('Sea-Side, Café')).toBe('sea side cafe')
  })

  it('folds Arabic diacritics away', () => {
    // Same word, one voweled, one bare -> one form.
    expect(normalizeForSearch('بَيْرُوت')).toBe(normalizeForSearch('بيروت'))
  })

  it('folds the alef and hamza variants onto bare alef', () => {
    const bare = normalizeForSearch('احمد')
    expect(normalizeForSearch('أحمد')).toBe(bare)
    expect(normalizeForSearch('إحمد')).toBe(bare)
    expect(normalizeForSearch('آحمد')).toBe(bare)
  })

  it('strips tatweel', () => {
    expect(normalizeForSearch('بيــروت')).toBe(normalizeForSearch('بيروت'))
  })

  it('folds alef maksura to ya and ta marbuta to ha', () => {
    expect(normalizeForSearch('مقهى')).toBe(normalizeForSearch('مقهي'))
    expect(normalizeForSearch('قلعة')).toBe(normalizeForSearch('قلعه'))
  })
})

describe('scoreMatch', () => {
  it('scores an exact normalized field 1', () => {
    expect(scoreMatch('le gray', 'Le Gray')).toBe(1)
  })

  it('scores a prefix and a contained run below exact but high', () => {
    expect(scoreMatch('gray', 'Le Gray Beirut')).toBeGreaterThan(0.8)
    expect(scoreMatch('le', 'Le Gray')).toBeGreaterThan(0.9)
  })

  it('tolerates a one-letter typo', () => {
    expect(scoreMatch('resturant', 'Restaurant')).toBeGreaterThan(SIMILARITY_THRESHOLD)
    expect(scoreMatch('beruit', 'Beirut')).toBeGreaterThan(SIMILARITY_THRESHOLD)
  })

  it('matches a typo against one word of a longer name', () => {
    expect(scoreMatch('byblso', 'Byblos Sur Mer')).toBeGreaterThan(SIMILARITY_THRESHOLD)
  })

  it('scores an unrelated query near zero', () => {
    expect(scoreMatch('pizza', 'Le Gray Hotel')).toBeLessThan(SIMILARITY_THRESHOLD)
  })

  it('is Arabic typo tolerant after folding', () => {
    // Query missing a letter still clears the bar against the full word.
    expect(scoreMatch('بيرو', 'بيروت')).toBeGreaterThan(SIMILARITY_THRESHOLD)
  })

  it('returns 0 for empty input on either side', () => {
    expect(scoreMatch('', 'Le Gray')).toBe(0)
    expect(scoreMatch('gray', '')).toBe(0)
  })
})

describe('bestFieldScore', () => {
  it('takes the best score across the fields', () => {
    // Matches the tagline, not the name.
    const score = bestFieldScore('rooftop', ['Le Gray', 'A rooftop bar over Beirut'])
    expect(score).toBeGreaterThan(SIMILARITY_THRESHOLD)
  })

  it('ignores null and undefined fields', () => {
    // "gray" is a contained run of "le gray", so a strong match, not a perfect one.
    expect(bestFieldScore('gray', [null, undefined, 'Le Gray'])).toBeGreaterThan(0.8)
    expect(bestFieldScore('gray', [null, undefined])).toBe(0)
  })
})
