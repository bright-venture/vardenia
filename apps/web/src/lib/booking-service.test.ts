import { describe, expect, it } from 'vitest'
import { translateInsertError } from './booking-service'
import { unavailableMessage } from './availability'

/**
 * What happens when the insert fails after the availability check passed.
 *
 * This is not an edge case, it is the ordinary outcome of two people booking the
 * last table at the same moment: both pass `checkAvailability`, because neither
 * request has been written yet, and the database trigger refuses the second.
 *
 * The customer who loses that race must be told the table is taken. Without this
 * translation they get a 500 and conclude the site is broken - and try again,
 * against the same full restaurant.
 */

const pgError = (message: string) => Object.assign(new Error(message), { code: '23514' })

describe('translateInsertError', () => {
  /**
   * The message comes from the trigger in
   * migrations/20260818_181600_booking_capacity_trigger. If that wording ever
   * changes, this test fails and the customer stops getting a useful answer -
   * which is the point of matching on it here rather than silently.
   */
  it('turns the capacity refusal into the same message the check would have given', () => {
    const outcome = translateInsertError(pgError('This place is fully booked at that time.'))

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.code).toBe('unavailable')
    expect(outcome.message).toBe(unavailableMessage('at-capacity'))
  })

  it('matches the trigger message however Postgres wraps it', () => {
    for (const message of [
      'This place is fully booked at that time.',
      'error: This place is fully booked at that time.',
      'FULLY BOOKED at that time',
    ]) {
      const outcome = translateInsertError(pgError(message))
      expect(outcome.ok, message).toBe(false)
      if (!outcome.ok) expect(outcome.code, message).toBe('unavailable')
    }
  })

  /**
   * Everything else stays an error. Inventing "try another time" for a failure
   * we do not recognise sends the customer back to a restaurant that is not
   * full, over a database that is down.
   */
  it.each([
    'connection terminated unexpectedly',
    'duplicate key value violates unique constraint "bookings_reference_idx"',
    'null value in column "customer_id" violates not-null constraint',
    '',
  ])('leaves %o as an error rather than guessing', (message) => {
    const outcome = translateInsertError(pgError(message))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.code).toBe('error')
  })

  it('never leaks the database message to the customer', () => {
    const outcome = translateInsertError(
      pgError('null value in column "customer_id" violates not-null constraint'),
    )
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.message).not.toContain('customer_id')
    expect(outcome.message).not.toContain('constraint')
  })

  it.each([null, undefined, 'a string', 42, {}])(
    'survives %o being thrown rather than an Error',
    (thrown) => {
      expect(() => translateInsertError(thrown)).not.toThrow()
      const outcome = translateInsertError(thrown)
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.code).toBe('error')
    },
  )
})
