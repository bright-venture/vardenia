import { describe, expect, it } from 'vitest'
import { parseIssueId } from './route'

/**
 * The issue id used to go straight from the query string into two database
 * calls, and every wrong value produced a 500 rather than a message: `abc`
 * failed the integer cast, `1.5` failed the query, and a number that simply did
 * not exist threw NotFound.
 *
 * This is the page checked immediately before artwork goes to a printer, so a
 * crash from a mistyped number lands at the worst possible moment.
 */

describe('parseIssueId', () => {
  it('accepts a plain positive integer', () => {
    expect(parseIssueId('1')).toBe(1)
    expect(parseIssueId('42')).toBe(42)
  })

  it('treats a missing parameter as no filter', () => {
    expect(parseIssueId(null)).toBeNull()
  })

  it.each(['abc', '', ' ', '1.5', '-1', '1e3', '0x1', 'null', 'undefined'])(
    'rejects %o',
    (value) => {
      expect(parseIssueId(value)).toBeNull()
    },
  )

  /**
   * Zero is not an id, and it is the value a careless `Number(x) || null` would
   * quietly turn into "no filter" - showing every code in the system on a sheet
   * somebody asked to narrow.
   */
  it('rejects zero rather than silently widening the sheet', () => {
    expect(parseIssueId('0')).toBeNull()
  })

  /**
   * `Number(' 1 ')` is 1, which coerces fine and then does not match anything.
   * Strings have to look like an id, not merely convert to one.
   */
  it('rejects a number with surrounding whitespace', () => {
    expect(parseIssueId(' 1')).toBeNull()
    expect(parseIssueId('1 ')).toBeNull()
  })

  it('rejects anything past the safe integer range', () => {
    expect(parseIssueId('9'.repeat(30))).toBeNull()
  })

  it('rejects the injection shapes that reached the query before', () => {
    expect(parseIssueId('1 OR 1=1')).toBeNull()
    expect(parseIssueId("1'; drop table issues; --")).toBeNull()
  })
})
