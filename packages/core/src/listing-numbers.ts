/**
 * Listing numbers - the number a business takes in the printed magazine, as
 * rules rather than as tables.
 *
 * The magazine has a fixed count of numbers (408 to begin with). Each
 * governorate owns one contiguous range of them, set in the admin, and a
 * business picks a free number from the range of the governorate it is in.
 * Ranges never overlap and never run past the total.
 *
 * Nothing here reads or writes a database: callers hand in the ranges they
 * already loaded, and get back a problem to show or a number to use.
 */

export const LISTING_NUMBER_MIN = 1

/** How many numbers the magazine has until the team changes it in the admin. */
export const DEFAULT_LISTING_TOTAL = 408

/** The governorates that can own a range, in the order the admin lists them. */
export const LISTING_GOVERNORATES = [
  'keserwan',
  'north-lebanon',
  'beirut',
  'beqaa',
  'south-lebanon',
  'chouf',
  'matn',
] as const

/** A governorate's slice of the numbers, both ends included. */
export interface NumberRange {
  governorate: string
  from: number
  to: number
}

/**
 * Why a range cannot be saved, or null when it can. The text is meant for the
 * admin: it names the governorate whose range is in the way.
 *
 * Another entry for the same governorate is skipped, so a range can be edited
 * without clashing with its own old value.
 */
export function rangeProblem(
  candidate: NumberRange,
  others: readonly NumberRange[],
  total: number,
): string | null {
  const { from, to } = candidate
  if (!Number.isInteger(from) || !Number.isInteger(to)) return 'Both ends must be whole numbers.'
  if (from < LISTING_NUMBER_MIN) return `The range cannot start below ${LISTING_NUMBER_MIN}.`
  if (from > to) return 'The range starts after it ends.'
  if (to > total) return `The range runs past the last number (${total}).`
  for (const other of others) {
    if (other.governorate === candidate.governorate) continue
    if (from <= other.to && other.from <= to) {
      return `The range overlaps ${other.governorate} (${other.from}-${other.to}).`
    }
  }
  return null
}

/** The number after the highest one any range reaches; 1 when none exist. */
export function nextFreeNumber(ranges: readonly NumberRange[]): number {
  return ranges.reduce((high, r) => Math.max(high, r.to), LISTING_NUMBER_MIN - 1) + 1
}

/** Every number in the range, in order. */
export function numbersIn(range: NumberRange): number[] {
  const out: number[] = []
  for (let n = range.from; n <= range.to; n++) out.push(n)
  return out
}

/** A whole number inside the range: 1.5 is never a printed number. */
export function isInRange(n: number, range: NumberRange): boolean {
  return Number.isInteger(n) && n >= range.from && n <= range.to
}

/** How many numbers the ranges hand out between them. */
export function allocatedCount(ranges: readonly NumberRange[]): number {
  return ranges.reduce((sum, r) => sum + (r.to - r.from + 1), 0)
}

/** Held numbers a range no longer covers, e.g. after it was shrunk. */
export function orphanedNumbers(held: readonly number[], range: NumberRange): number[] {
  return held.filter((n) => !isInRange(n, range))
}

/** Why the total cannot drop to this value, or null when it can. */
export function totalProblem(newTotal: number, highestUsed: number): string | null {
  if (!Number.isInteger(newTotal) || newTotal < LISTING_NUMBER_MIN) {
    return 'The total must be a whole number of at least 1.'
  }
  if (newTotal < highestUsed) {
    return `Number ${highestUsed} is already in use, so the total cannot be below it.`
  }
  return null
}
