import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

const lines = (csv: string) => csv.split('\r\n')

describe('toCsv', () => {
  it('writes a header and rows', () => {
    expect(lines(toCsv(['a', 'b'], [['1', '2']]))).toEqual(['a,b', '1,2'])
  })

  /**
   * The failure this module exists to prevent: a comma in a business name
   * silently shifting every column after it, so a scan count is read off the
   * wrong row.
   */
  it('quotes fields containing a comma', () => {
    const csv = toCsv(['name', 'scans'], [['Em Sherif Cafe, Beirut', 42]])
    expect(lines(csv)[1]).toBe('"Em Sherif Cafe, Beirut",42')
  })

  it('doubles quotes inside a quoted field', () => {
    const csv = toCsv(['name'], [['The "Grand" Hotel']])
    expect(lines(csv)[1]).toBe('"The ""Grand"" Hotel"')
  })

  it('quotes fields containing newlines rather than breaking the row', () => {
    const csv = toCsv(['note'], [['line one\nline two']])
    expect(csv).toContain('"line one\nline two"')
    // The header plus one logical row, even though the text contains a newline.
    expect(csv.split('\r\n')).toHaveLength(2)
  })

  it('leaves ordinary values unquoted', () => {
    expect(lines(toCsv(['a'], [['Le Royal Hotel']]))[1]).toBe('Le Royal Hotel')
  })

  it('renders empty for null and undefined rather than the word null', () => {
    expect(lines(toCsv(['a', 'b'], [[null, undefined]]))[1]).toBe(',')
  })

  it('renders booleans as words a reader understands', () => {
    expect(lines(toCsv(['direct'], [[true], [false]]))).toEqual(['direct', 'yes', 'no'])
  })

  it('renders dates as ISO timestamps', () => {
    const csv = toCsv(['at'], [[new Date('2026-08-01T09:30:00.000Z')]])
    expect(lines(csv)[1]).toBe('2026-08-01T09:30:00.000Z')
  })

  it('keeps Arabic text intact', () => {
    expect(lines(toCsv(['name'], [['مطعم بيروت']]))[1]).toBe('مطعم بيروت')
  })

  it('handles no rows without producing a stray blank line', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b')
  })

  it('quotes a header that needs it too', () => {
    expect(lines(toCsv(['scans, total'], []))[0]).toBe('"scans, total"')
  })
})
