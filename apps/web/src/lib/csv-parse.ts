/**
 * Reads CSV. The other direction, writing it, is lib/csv.
 *
 * # Why this is hand-written
 *
 * Because the alternative is a dependency, and the reason the input is CSV at
 * all is to avoid one. Every usable Node xlsx reader is a large package with a
 * history of advisories, and this repo has just spent a day getting its
 * advisory count down. Excel exports CSV in two clicks.
 *
 * CSV is also the format people think is trivial and then get wrong. A quoted
 * field may contain commas, newlines and doubled quotes, and the Keserwan file
 * has descriptions full of commas. A naive `line.split(',')` silently shifts
 * every column after the first comma in a description, which does not throw -
 * it produces listings whose phone number is half a sentence.
 *
 * So this is a real state machine over RFC 4180, and it is tested against the
 * cases that break the naive version.
 *
 * # What it deliberately does not do
 *
 * No type coercion, no header mangling, no empty-row skipping beyond the
 * trailing newline. Everything comes back as a string, and interpretation is
 * lib/import/listing-row's job. A parser that guesses types is a parser that
 * turns a phone number into a float.
 */

/** A byte-order mark, which Excel writes and which would otherwise join the first header. */
const BOM = '﻿'

/**
 * Split CSV text into rows of raw string cells.
 *
 * Handles quoted fields containing commas, CR, LF and doubled quotes. Line
 * endings may be LF or CRLF, mixed.
 */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith(BOM) ? text.slice(1) : text

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let index = 0

  /** A field ends. Even an empty one counts, so this is never conditional. */
  const endField = () => {
    row.push(field)
    field = ''
  }

  /**
   * A row ends. A blank line is dropped rather than becoming a row of one empty
   * string, which is what a trailing newline would otherwise produce on every
   * file and what would make the caller's row count wrong by one.
   */
  const endRow = () => {
    endField()
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }

  while (index < input.length) {
    const char = input[index]!

    if (quoted) {
      if (char !== '"') {
        field += char
        index += 1
        continue
      }

      // A doubled quote inside a quoted field is one literal quote.
      if (input[index + 1] === '"') {
        field += '"'
        index += 2
        continue
      }

      quoted = false
      index += 1
      continue
    }

    if (char === '"' && field === '') {
      quoted = true
      index += 1
      continue
    }

    if (char === ',') {
      endField()
      index += 1
      continue
    }

    if (char === '\r' || char === '\n') {
      endRow()
      // CRLF is one ending, not two.
      index += char === '\r' && input[index + 1] === '\n' ? 2 : 1
      continue
    }

    field += char
    index += 1
  }

  // Whatever is left when the text runs out is a final row with no newline.
  if (field !== '' || row.length > 0) endRow()

  return rows
}

export interface CsvTable {
  headers: string[]
  /** One object per data row, keyed by header. Missing trailing cells are ''. */
  rows: Record<string, string>[]
}

/**
 * The same thing, keyed by the header row.
 *
 * Short rows are padded rather than rejected. Excel omits trailing empty cells,
 * so a row whose last four columns are blank arrives with four fewer fields,
 * and treating that as malformed would reject most of a real export.
 */
export function parseCsvTable(text: string): CsvTable {
  const rows = parseCsv(text)
  const headerRow = rows[0]

  if (!headerRow) return { headers: [], rows: [] }

  const headers = headerRow.map((header) => header.trim())

  return {
    headers,
    rows: rows
      .slice(1)
      .map((cells) =>
        Object.fromEntries(headers.map((header, column) => [header, (cells[column] ?? '').trim()])),
      ),
  }
}
