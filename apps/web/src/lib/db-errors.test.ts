import { describe, expect, it } from 'vitest'
import { ValidationError } from 'payload'
import { isUniqueViolation, uniqueViolation } from './db-errors'

/**
 * A write made through Payload never shows the database's 23505: the adapter
 * rethrows it as a ValidationError. Checking for the code alone missed every
 * one of those, so a month drawn up twice at once surfaced as a crash and a
 * second review as a generic error.
 */

/** What @payloadcms/drizzle's handleUpsertError throws for a unique refusal. */
const payloadRefusal = (path: string) =>
  new ValidationError({
    collection: 'statements',
    errors: [{ message: 'Value must be unique', path, tableName: 'statements' } as never],
  })

describe('isUniqueViolation', () => {
  it('recognises the raw driver error, however deep', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
    expect(isUniqueViolation({ cause: { cause: { code: '23505' } } })).toBe(true)
  })

  it("recognises Payload's form, which has no code", () => {
    expect(isUniqueViolation(payloadRefusal('number'))).toBe(true)
  })

  it('does not mistake an ordinary validation error for one', () => {
    const invalid = new ValidationError({
      collection: 'statements',
      errors: [{ message: 'This field is required.', path: 'period' }],
    })
    expect(isUniqueViolation(invalid)).toBe(false)
    expect(isUniqueViolation(new Error('boom'))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })
})

describe('uniqueViolation', () => {
  it('names what was refused', () => {
    expect(uniqueViolation({ code: '23505', constraint: 'statements_number_idx' })).toBe(
      'statements_number_idx',
    )
    expect(uniqueViolation(payloadRefusal('business_id, period'))).toBe('business_id, period')
  })
})
