/**
 * CSV generation, done properly rather than by joining with commas.
 *
 * Business names are typed freely by staff and this is Lebanon: "Em Sherif
 * Cafe, Beirut" has a comma in it, and a name with an apostrophe or a quotation
 * mark is ordinary. Naive joining turns one of those into two columns and
 * silently shifts every field after it, which produces a spreadsheet that looks
 * fine until someone reads a scan count off the wrong row.
 *
 * Follows RFC 4180: fields containing a comma, quote or newline are wrapped in
 * quotes, and quotes inside them are doubled.
 */

export type CsvValue = string | number | boolean | Date | null | undefined

function serialize(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

function escapeField(value: CsvValue): string {
  const text = serialize(value)
  if (!/[",\r\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * Rows are arrays rather than objects so column order is explicit and cannot
 * drift with key ordering.
 *
 * CRLF line endings because that is what RFC 4180 specifies and what Excel
 * expects; a lone newline can leave the last column merged in some versions.
 */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(escapeField).join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeField).join(','))
  }
  return lines.join('\r\n')
}

/**
 * A byte-order mark, so Excel opens the file as UTF-8.
 *
 * Without it Excel on Windows guesses the local codepage and Arabic business
 * names arrive as mojibake. Numbers and Google Sheets do not need this and are
 * not harmed by it.
 */
export const UTF8_BOM = '﻿'
