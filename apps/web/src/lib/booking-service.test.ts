import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { createBooking, translateInsertError } from './booking-service'
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

  /**
   * The trigger in migrations/20261013_120000_customer_booking_limit, which
   * holds the per-customer limit against simultaneous requests. Matched on its
   * wording, so a change to it fails here rather than turning into "could not
   * book" for the guest.
   */
  it('turns the per-customer limit refusal into the same answer the count gives', () => {
    const outcome = translateInsertError(
      pgError('This account already has the most upcoming bookings allowed.'),
    )

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.code).toBe('rate-limited')
    expect(outcome.message).toMatch(/upcoming bookings/)
  })

  /**
   * This took no language, so the customer who lost the race for the last table
   * was told "fully booked" in English - on the Arabic site as well.
   */
  it('refuses in the language the customer booked in', () => {
    for (const locale of ['ar', 'fr', 'zh'] as const) {
      const outcome = translateInsertError(
        pgError('This place is fully booked at that time.'),
        locale,
      )
      if (outcome.ok) throw new Error('expected a refusal')
      expect(outcome.message, locale).toBe(unavailableMessage('at-capacity', locale))
      expect(outcome.message, locale).not.toBe(unavailableMessage('at-capacity', 'en'))
    }
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

/**
 * The booking guard's own refusals, which arrive as insert errors worded with
 * `unavailableMessage`. They used to fall through to "could not complete that
 * booking" and an error report, so a closed date added after the page loaded
 * looked like a broken site to the guest and a bug to the team.
 */
describe('translateInsertError, for the booking guard', () => {
  it('turns a closed-date refusal into the closed-date answer, in the guest language', () => {
    const outcome = translateInsertError(new Error(unavailableMessage('closed-period')), 'ar')
    expect(outcome).toEqual({
      ok: false,
      code: 'unavailable',
      message: unavailableMessage('closed-period', 'ar'),
    })
  })

  it('turns a listed-only refusal into "does not take bookings"', () => {
    const outcome = translateInsertError(
      new Error('This place is listed only and does not take bookings.'),
    )
    expect(outcome).toEqual({
      ok: false,
      code: 'unavailable',
      message: unavailableMessage('bookings-disabled'),
    })
  })

  it('still calls an unknown failure an error', () => {
    expect(translateInsertError(new Error('connection reset')).ok).toBe(false)
    expect((translateInsertError(new Error('connection reset')) as { code: string }).code).toBe(
      'error',
    )
  })
})

describe('createBooking, before anything is written', () => {
  const HOUR = 3_600_000
  const NOW = new Date('2026-10-20T08:00:00.000Z')
  const start = new Date(NOW.getTime() + 48 * HOUR)
  const end = new Date(start.getTime() + 2 * HOUR)

  const fakePayload = (business: Record<string, unknown>, closures: unknown[] = []) => {
    const create = vi.fn(async () => ({ id: 1, reference: 'ABCD1234', status: 'pending' }))
    const payload = {
      findByID: vi.fn(async () => business),
      find: vi.fn(async (args: { collection: string }) =>
        args.collection === 'closures'
          ? { docs: closures, totalDocs: closures.length }
          : { docs: [], totalDocs: 0 },
      ),
      create,
    } as unknown as Payload
    return { payload, create }
  }

  const restaurant = {
    id: 7,
    name: 'Em Sherif',
    _status: 'published',
    subcategories: ['restaurants'],
    booking: { enabled: true, capacity: 5, maxDurationMinutes: 240, leadTimeMinutes: 0 },
  }

  const request = {
    business: 7,
    start: start.toISOString(),
    end: end.toISOString(),
    partySize: 2,
    locale: 'en' as const,
  }

  it('refuses a closed day with the closed-day answer, and writes nothing', async () => {
    const day = start.toISOString().slice(0, 10)
    const { payload, create } = fakePayload(restaurant, [{ startsOn: day, endsOn: day }])
    const outcome = await createBooking({ payload, request, customerId: 5, now: NOW })
    expect(outcome).toEqual({
      ok: false,
      code: 'unavailable',
      message: unavailableMessage('closed-period'),
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses a listed-only place with "does not take bookings", and writes nothing', async () => {
    const { payload, create } = fakePayload({ ...restaurant, subcategories: ['cafes'] })
    const outcome = await createBooking({ payload, request, customerId: 5, now: NOW })
    expect(outcome).toEqual({
      ok: false,
      code: 'unavailable',
      message: unavailableMessage('bookings-disabled'),
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('books an open day', async () => {
    const { payload, create } = fakePayload(restaurant)
    const outcome = await createBooking({ payload, request, customerId: 5, now: NOW })
    expect(outcome).toMatchObject({ ok: true, reference: 'ABCD1234', businessName: 'Em Sherif' })
    expect(create).toHaveBeenCalledTimes(1)
  })
})
