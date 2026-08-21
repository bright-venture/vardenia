import { describe, expect, it } from 'vitest'
import { normaliseQuery } from './search'

/**
 * The query goes into a SQL `LIKE`, so what it is allowed to contain is the part
 * worth testing. Payload parameterises the value, so this is not about
 * injection - it is about `%` quietly matching everything, and about not running
 * a query for one letter across the whole catalogue.
 */

describe('normaliseQuery', () => {
  it('keeps an ordinary search', () => {
    expect(normaliseQuery('byblos')).toBe('byblos')
    expect(normaliseQuery('Le Gray')).toBe('Le Gray')
  })

  it('trims and collapses whitespace', () => {
    expect(normaliseQuery('  beach   club  ')).toBe('beach club')
    expect(normaliseQuery('\n\tmzaar\n')).toBe('mzaar')
  })

  /**
   * `%` and `_` are wildcards in LIKE. Left in, a search for "100%" matches
   * every row in the table and reads as though the site cannot search.
   */
  it('strips SQL wildcards rather than searching for everything', () => {
    expect(normaliseQuery('100%')).toBe('100')
    expect(normaliseQuery('%%%')).toBeNull()
    expect(normaliseQuery('a_b')).toBe('a b')
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['an empty string', ''],
    ['only spaces', '     '],
    ['a single letter', 'a'],
  ])('returns null for %s', (_name, value) => {
    expect(normaliseQuery(value)).toBeNull()
  })

  it('accepts two letters, which is the shortest useful search', () => {
    expect(normaliseQuery('ba')).toBe('ba')
  })

  /** Bounded so a very long string cannot be pushed into the query. */
  it('caps the length', () => {
    const long = 'a'.repeat(500)
    expect(normaliseQuery(long)?.length).toBe(80)
  })

  it('does not mangle Arabic', () => {
    expect(normaliseQuery('  بيروت  ')).toBe('بيروت')
  })
})
