import { describe, expect, it } from 'vitest'
import { parseCsv, parseCsvTable } from './csv-parse'
import { toCsv } from './csv'
import { SAMPLE_CSV, SAMPLE_ROWS } from '../import/sample-listings'

/**
 * The cases that break the naive `line.split(',')` version, plus a round trip
 * against this repo's own CSV writer.
 *
 * The failure being guarded against is quiet: a comma inside a description
 * shifts every later column by one, so a listing ends up with half a sentence
 * where its phone number should be. Nothing throws.
 */

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  /** The one that matters. */
  it('keeps a comma inside a quoted field', () => {
    expect(parseCsv('name,note\nAlsa,"Spacious, modern, and busy"')).toEqual([
      ['name', 'note'],
      ['Alsa', 'Spacious, modern, and busy'],
    ])
  })

  it('keeps a newline inside a quoted field', () => {
    const [, row] = parseCsv('name,note\nAlsa,"line one\nline two"')
    expect(row).toEqual(['Alsa', 'line one\nline two'])
  })

  it('turns a doubled quote into one quote', () => {
    const [, row] = parseCsv('name,note\nAlsa,"They call it ""the terrace"""')
    expect(row).toEqual(['Alsa', 'They call it "the terrace"'])
  })

  it('handles CRLF, LF and a mix of the two', () => {
    expect(parseCsv('a,b\r\n1,2\n3,4\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('keeps empty fields, including trailing ones', () => {
    expect(parseCsv('a,b,c\n1,,')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', ''],
    ])
  })

  it('drops a trailing newline rather than inventing a row', () => {
    expect(parseCsv('a,b\n1,2\n')).toHaveLength(2)
  })

  it('strips the byte order mark Excel writes', () => {
    const [header] = parseCsv('﻿name,phone\nAlsa,+961')
    expect(header?.[0]).toBe('name')
  })

  it('reads a last row that has no newline after it', () => {
    expect(parseCsv('a,b\n1,2')).toHaveLength(2)
  })

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('\n')).toEqual([])
  })
})

describe('parseCsvTable', () => {
  it('keys each row by its header', () => {
    const table = parseCsvTable('Name,Phone\nAlsa,+961 9 000 000')
    expect(table.headers).toEqual(['Name', 'Phone'])
    expect(table.rows[0]).toEqual({ Name: 'Alsa', Phone: '+961 9 000 000' })
  })

  /**
   * Excel omits trailing empty cells, so a row whose last columns are blank
   * arrives short. Rejecting that would reject most of a real export.
   */
  it('pads a short row rather than rejecting it', () => {
    const table = parseCsvTable('A,B,C\n1')
    expect(table.rows[0]).toEqual({ A: '1', B: '', C: '' })
  })

  it('trims surrounding whitespace from headers and values', () => {
    const table = parseCsvTable(' Name , Phone \n  Alsa  ,  +961  ')
    expect(table.rows[0]).toEqual({ Name: 'Alsa', Phone: '+961' })
  })

  it('has no rows when the file is only a header', () => {
    expect(parseCsvTable('A,B').rows).toEqual([])
  })
})

/**
 * Reading and writing are separate files that must agree. This is the test that
 * would catch one of them being changed alone.
 */
describe('a round trip through this repo own CSV writer', () => {
  it('survives commas, quotes and newlines', () => {
    const headers = ['name', 'note']
    const rows = [
      ['Alsa, Zouk', 'They call it "the terrace"'],
      ['Murray Resto', 'line one\nline two'],
    ]

    expect(parseCsv(toCsv(headers, rows))).toEqual([headers, ...rows])
  })
})

/**
 * A whole file, rather than a hand-made string.
 *
 * The fixture is `sample-listings.csv`, twenty rows written to carry the same
 * awkwardness as the real directory this parser was built for - descriptions
 * full of commas, quoted fields, a trailing empty column. The real file is
 * business data and is not committed; it is still checked when present, by
 * .unlazy/checks/import-real-file.mjs.
 *
 * A parser that passes hand-made single cases and mangles a whole file is worth
 * nothing, so this asserts column integrity across every row.
 */
describe('a whole spreadsheet export', () => {
  const text = SAMPLE_CSV
  const table = parseCsvTable(text)

  it('finds every row', () => {
    expect(table.rows).toHaveLength(SAMPLE_ROWS)
  })

  it('finds all 23 columns, in order', () => {
    expect(table.headers).toHaveLength(23)
    expect(table.headers.slice(0, 6)).toEqual([
      'ID',
      'Category',
      'District',
      'Class',
      'Location',
      'Name / Listing',
    ])
  })

  /**
   * The positive control for the whole file. If a naive `split(',')` would have
   * produced the right answer, this fixture is not exercising the parser and
   * neither is the real export it stands in for.
   */
  it('is a file a naive comma split would get wrong', () => {
    const lines = text.trim().split(/\r?\n/)
    const width = lines[0]!.split(',').length
    const broken = lines.slice(1).filter((line) => line.split(',').length !== width)

    expect(broken.length, 'no row has a comma inside a quoted field').toBeGreaterThan(0)
  })

  /**
   * The sharpest test for a shifted column, because Category is a closed set.
   * A naive split moves a fragment of a description into here, where an
   * unexpected value shows up at once.
   */
  it('never lets a value from another column land in Category', () => {
    const known = new Set([
      'Hotels',
      'Restaurants',
      'Guest Houses',
      'Activities',
      'Tour Guides',
      'Festivals',
    ])

    for (const row of table.rows) {
      expect(known.has(row['Category'] ?? ''), `unexpected Category: ${row['Category']}`).toBe(true)
    }
  })

  it('keeps a description containing commas in one cell', () => {
    const row = table.rows.find((r) => r['ID'] === '1')
    expect(row?.['Overview / Description']).toBe(
      '5-star mountain resort | Luxury rooms and suites, spa, heated pools',
    )
  })

  it('gives every row a name and a category', () => {
    for (const row of table.rows) {
      expect(row['Name / Listing']).toBeTruthy()
      expect(row['Category']).toBeTruthy()
    }
  })
})
