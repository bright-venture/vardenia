/**
 * Listing numbers - the number a business takes in the printed magazine, as
 * rules rather than as tables.
 *
 * The magazine has a fixed count of numbers (408 to begin with). Each
 * governorate owns one contiguous range of them, set in the admin, and a
 * business picks a free number from the range of the governorate it is in.
 * Ranges never overlap and never run past the total.
 *
 * An issue covers either all of Lebanon (one block per governorate) or one
 * governorate (27 November 2026): then each block belongs to one city of that
 * governorate (Broummana pages 21-40), and a business is offered only the
 * block of its own city.
 *
 * Nothing here reads or writes a database: callers hand in the ranges they
 * already loaded, and get back a problem to show or a number to use.
 */

import { GOVERNORATES } from './regions'

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

/**
 * A governorate's slice of the numbers, both ends included. `city` is set only
 * on an issue that covers one governorate: the block then belongs to that city.
 */
export interface NumberRange {
  governorate: string
  city?: string | null
  from: number
  to: number
}

/** What an issue covers: the whole country, or one governorate split by city. */
export const ISSUE_COVERAGES = ['all-lebanon', 'governorate'] as const
export type IssueCoverage = (typeof ISSUE_COVERAGES)[number]

export const ISSUE_COVERAGE_LABELS: Record<IssueCoverage, string> = {
  'all-lebanon': 'All Lebanon',
  governorate: 'One governorate',
}

/** An issue's coverage as stored. Issues made before it existed hold null: All Lebanon. */
export function coverageOf(value: unknown): IssueCoverage {
  return value === 'governorate' ? 'governorate' : 'all-lebanon'
}

/** The coverage fields of an issue, as read from the database. */
export interface IssueCoverageFields {
  coverage?: unknown
  governorate?: unknown
}

/** A city of that governorate (core regions). */
export function isCityOf(governorate: string, city: string): boolean {
  return GOVERNORATES.some((g) => g.slug === governorate && g.cities.some((c) => c.slug === city))
}

const governorateName = (slug: string): string =>
  GOVERNORATES.find((g) => g.slug === slug)?.en ?? slug

const cityName = (slug: string): string => {
  for (const g of GOVERNORATES) {
    const found = g.cities.find((c) => c.slug === slug)
    if (found) return found.en
  }
  return slug
}

const cityOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null

/** "matn" or "matn / broummana", for messages naming another block. */
const rangeName = (range: NumberRange): string => {
  const city = cityOrNull(range.city)
  return city ? `${range.governorate} / ${city}` : range.governorate
}

/**
 * The block of an issue that serves a business in this governorate and city,
 * or null when it has none.
 *
 * - All Lebanon (or no coverage stored): the governorate's block with no city,
 *   whatever city the business is in.
 * - One governorate: only when the business is in that governorate, and only
 *   the block of the business's own city. Without a city, none.
 *
 * `ranges` may hold any of the issue's blocks; the ones that do not fit are skipped.
 */
export function rangeForPlace<R extends { governorate: string; city?: string | null }>(
  ranges: readonly R[],
  issue: IssueCoverageFields,
  place: { governorate: string; city?: string | null },
): R | null {
  if (coverageOf(issue.coverage) === 'governorate') {
    const city = cityOrNull(place.city)
    if (issue.governorate !== place.governorate || city === null) return null
    return (
      ranges.find((r) => r.governorate === place.governorate && cityOrNull(r.city) === city) ?? null
    )
  }
  return (
    ranges.find((r) => r.governorate === place.governorate && cityOrNull(r.city) === null) ?? null
  )
}

/**
 * Why a block cannot sit in this issue with this governorate and city, or null.
 * `others` are the issue's other blocks (not this one).
 *
 * One governorate: the block's governorate is the issue's, it names a city of
 * it, and each city has one block. All Lebanon: no city, and one block per
 * governorate. The database's unique index cannot say that last rule alone
 * (a NULL city never equals another), hence the check here as well.
 */
export function rangePlaceProblem(args: {
  issue: IssueCoverageFields
  governorate: string
  city: string | null | undefined
  others: readonly { governorate: string; city?: string | null }[]
}): string | null {
  const city = cityOrNull(args.city)
  if (coverageOf(args.issue.coverage) === 'governorate') {
    const issueGovernorate = cityOrNull(args.issue.governorate)
    if (issueGovernorate === null) {
      return 'This issue covers one governorate: choose its governorate on the issue first.'
    }
    const name = governorateName(issueGovernorate)
    if (args.governorate !== issueGovernorate) {
      return `This issue is for ${name} only: choose ${name} as the governorate of this block.`
    }
    if (city === null) return `This issue is for ${name} only: choose the city of this block.`
    if (!isCityOf(issueGovernorate, city)) {
      return `${cityName(city)} is not in ${name}. Choose one of ${name}'s cities.`
    }
    if (args.others.some((o) => cityOrNull(o.city) === city)) {
      return `${cityName(city)} already has a block in this issue.`
    }
    return null
  }
  if (city !== null) {
    return 'This issue covers All Lebanon: a block is for a whole governorate. Leave the city empty.'
  }
  if (args.others.some((o) => o.governorate === args.governorate && cityOrNull(o.city) === null)) {
    return `${governorateName(args.governorate)} already has a block in this issue.`
  }
  return null
}

/**
 * Why a range cannot be saved, or null when it can. The text is meant for the
 * admin: it names the governorate whose range is in the way.
 *
 * Another entry for the same governorate and city is skipped, so a range can be
 * edited without clashing with its own old value. Two city blocks of one
 * governorate are checked against each other like any two blocks.
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
    if (
      other.governorate === candidate.governorate &&
      cityOrNull(other.city) === cityOrNull(candidate.city)
    ) {
      continue
    }
    if (from <= other.to && other.from <= to) {
      return `The range overlaps ${rangeName(other)} (${other.from}-${other.to}).`
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
