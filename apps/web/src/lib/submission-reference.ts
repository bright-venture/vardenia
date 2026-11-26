/**
 * The short reference a business quotes to staff and writes on the Whish
 * payment, like VD-1042. Built from a number the caller owns (a counter or the
 * record id); this file only formats and recognises it.
 */
const PATTERN = /^VD-[1-9]\d{0,9}$/

export function formatSubmissionReference(n: number): string {
  if (!Number.isSafeInteger(n) || n < 1)
    throw new RangeError('A reference needs a whole number of 1 or more.')
  return `VD-${n}`
}

export function isSubmissionReference(value: unknown): value is string {
  return typeof value === 'string' && PATTERN.test(value)
}
