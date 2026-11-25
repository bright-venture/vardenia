/**
 * Lebanese phone numbers in one shape, so the same sender written four ways is
 * one sender (the Whish payment check compares the sender number and time).
 *
 * Output is the national number with the leading 0: `03123456` for a mobile,
 * `01234567` for a landline, `70123456` stays `70123456` (mobile prefixes 3,
 * 70, 71, 76, 78, 79, 81; landlines 01, 04 to 09). The country prefix, spaces,
 * dashes, dots, brackets and a leading + or 00 are all removed.
 *
 * Returns null when the text is not a Lebanese number at all, so a caller
 * cannot store a guess.
 */
const MOBILE_PREFIX = /^(3|70|71|76|78|79|81)\d+$/
const LANDLINE_PREFIX = /^[14-9]\d+$/

export function normaliseLebanesePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!/^[+\d\s().-]+$/.test(raw)) return null
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('961')) digits = digits.slice(3)
  else if (digits.startsWith('0')) digits = digits.slice(1)
  else if (raw.startsWith('+')) return null // a + number from another country

  // National number without the trunk 0: 7 digits (3 + 6) or 8 digits.
  if (MOBILE_PREFIX.test(digits)) {
    const mobile = digits.startsWith('3') ? digits.length === 7 : digits.length === 8
    return mobile ? `0${digits}` : null
  }
  if (LANDLINE_PREFIX.test(digits) && digits.length === 7) return `0${digits}`
  return null
}
