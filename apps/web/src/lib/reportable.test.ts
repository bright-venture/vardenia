import { describe, expect, it } from 'vitest'
import { APIError } from 'payload'
import { isApplicationFault } from './reportable'

/**
 * The filter in front of the error collection.
 *
 * Tested against Payload's real `APIError` rather than a hand-made object with a
 * `status` property, because the whole premise is that Payload's errors carry a
 * numeric status. A fixture that simply asserts the premise would keep passing
 * if Payload ever stopped doing it, which is the one change that would silently
 * break this.
 */

describe('what counts as our fault', () => {
  it('drops an authentication failure, which is the case this exists for', () => {
    // Exactly what AuthenticationError constructs: message plus 401.
    const wrongPassword = new APIError('The email or password provided is incorrect.', 401)
    expect(isApplicationFault(wrongPassword)).toBe(false)
  })

  it.each([
    [400, 'ValidationError, QueryError, MissingFile, FileUploadError'],
    [401, 'AuthenticationError, LockedAuth, UnauthorizedError'],
    [403, 'Forbidden, UnverifiedEmail'],
    [404, 'NotFound'],
    [423, 'Locked'],
  ])('drops %i (%s)', (status) => {
    expect(isApplicationFault(new APIError('refused', status))).toBe(false)
  })

  it.each([
    [500, 'APIError default, InvalidConfiguration, InvalidSchema'],
    [502, 'a failing upstream'],
    [503, 'unavailable'],
  ])('keeps %i (%s)', (status) => {
    expect(isApplicationFault(new APIError('broken', status))).toBe(true)
  })

  /**
   * The positive control for the whole change. The favicon locale crash is a
   * plain Error with no status, it was a real bug, and it was found precisely
   * because it was recorded. If a filter ever drops this, the filter is wrong.
   */
  it('keeps a plain Error, which is how the favicon bug was caught', () => {
    const real = new Error('invalid input value for enum payload._locales: "favicon.ico"')
    expect(isApplicationFault(real)).toBe(true)
  })

  it('reports anything it does not recognise', () => {
    expect(isApplicationFault(undefined)).toBe(true)
    expect(isApplicationFault(null)).toBe(true)
    expect(isApplicationFault('a string someone threw')).toBe(true)
    expect(isApplicationFault({})).toBe(true)
    expect(isApplicationFault({ status: 'not a number' })).toBe(true)
    expect(isApplicationFault({ status: Number.NaN })).toBe(true)
  })

  /** 399 and 500 are the two sides of the boundary; neither is a client fault. */
  it('draws the line exactly at 400 and 499', () => {
    expect(isApplicationFault(new APIError('x', 399))).toBe(true)
    expect(isApplicationFault(new APIError('x', 400))).toBe(false)
    expect(isApplicationFault(new APIError('x', 499))).toBe(false)
    expect(isApplicationFault(new APIError('x', 500))).toBe(true)
  })
})

/**
 * Guards the premise rather than our own code: Payload's own error class must
 * keep carrying a numeric `status`, or the filter silently reports everything
 * again and the noise comes back.
 */
describe("Payload's error shape, which this depends on", () => {
  it('puts a numeric status on APIError', () => {
    const error = new APIError('anything', 401)
    expect(error).toHaveProperty('status')
    expect(typeof (error as unknown as { status: unknown }).status).toBe('number')
  })

  it('defaults to 500 when no status is given, so an unlabelled error is reported', () => {
    expect(isApplicationFault(new APIError('unlabelled'))).toBe(true)
  })
})
