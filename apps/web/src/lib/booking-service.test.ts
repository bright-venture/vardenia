import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { closedPeriods, createBooking, translateInsertError } from './booking-service'
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

/**
 * A retry of the same booking attempt. On a weak connection the booking is made
 * and the answer never reaches the phone; the guest presses "book" again with
 * the same attempt id, and must get that booking back, not a second one.
 */
describe('createBooking, retried with the same attempt id', () => {
  const HOUR = 3_600_000
  const NOW = new Date('2026-10-20T08:00:00.000Z')
  const start = new Date(NOW.getTime() + 48 * HOUR)
  const end = new Date(start.getTime() + 2 * HOUR)
  const ATTEMPT = '5d04e05d-6394-4372-96d9-b72e8b3ae9a7'

  const restaurant = {
    id: 7,
    name: 'Em Sherif',
    _status: 'published',
    subcategories: ['restaurants'],
    booking: { enabled: true, capacity: 1, maxDurationMinutes: 240, leadTimeMinutes: 0 },
  }

  const request = {
    business: 7,
    start: start.toISOString(),
    end: end.toISOString(),
    partySize: 2,
    locale: 'en' as const,
    requestId: ATTEMPT,
  }

  /**
   * `earlier` is a booking this attempt already made. `madeMeanwhile` is one
   * that appears only after the insert fails: the other copy of a request that
   * arrived at the same moment.
   */
  const harness = (opts: {
    earlier?: Record<string, unknown>
    madeMeanwhile?: Record<string, unknown>
    insertError?: Error
  }) => {
    let failed = false
    const lookups: string[] = []
    const create = vi.fn(async () => {
      if (opts.insertError) {
        failed = true
        throw opts.insertError
      }
      return { id: 1, reference: 'NEWREF01', status: 'pending' }
    })
    const payload = {
      findByID: vi.fn(async () => restaurant),
      find: vi.fn(async (args: { collection: string; where?: unknown }) => {
        const where = JSON.stringify(args.where ?? {})
        if (args.collection === 'bookings' && where.includes('"requestId"')) {
          lookups.push(where)
          const found = opts.earlier ?? (failed ? opts.madeMeanwhile : undefined)
          return { docs: found ? [found] : [], totalDocs: found ? 1 : 0 }
        }
        return { docs: [], totalDocs: 0 }
      }),
      create,
    } as unknown as Payload
    return { payload, create, lookups }
  }

  it('returns the booking the attempt already made, and makes no other', async () => {
    const h = harness({ earlier: { id: 41, reference: 'FIRST001', status: 'pending' } })
    const outcome = await createBooking({ payload: h.payload, request, customerId: 5, now: NOW })
    expect(outcome).toMatchObject({
      ok: true,
      replayed: true,
      reference: 'FIRST001',
      bookingId: 41,
    })
    expect(h.create).not.toHaveBeenCalled()
  })

  it('looks the attempt up for this customer only', async () => {
    const h = harness({})
    await createBooking({ payload: h.payload, request, customerId: 5, now: NOW })
    expect(h.lookups[0]).toContain('"customer":{"equals":5}')
    expect(h.lookups[0]).toContain(`"requestId":{"equals":"${ATTEMPT}"}`)
  })

  it('stores the attempt id on a new booking', async () => {
    const h = harness({})
    const outcome = await createBooking({ payload: h.payload, request, customerId: 5, now: NOW })
    expect(outcome).toMatchObject({ ok: true, reference: 'NEWREF01' })
    expect(outcome).not.toHaveProperty('replayed')
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ requestId: ATTEMPT }) }),
    )
  })

  /**
   * Both copies arrive together. Both pass the lookup (nothing made yet); the
   * first inserts, the second is refused by the capacity trigger, which counts
   * the first. The guest must not be told "fully booked" about their own table.
   */
  it('answers a simultaneous copy with the booking the other copy made', async () => {
    const h = harness({
      insertError: new Error('This place is fully booked at that time.'),
      madeMeanwhile: { id: 42, reference: 'TWIN0001', status: 'pending' },
    })
    const outcome = await createBooking({ payload: h.payload, request, customerId: 5, now: NOW })
    expect(outcome).toMatchObject({ ok: true, replayed: true, reference: 'TWIN0001' })
  })

  it('still reports a real refusal when no copy made a booking', async () => {
    const h = harness({ insertError: new Error('This place is fully booked at that time.') })
    const outcome = await createBooking({ payload: h.payload, request, customerId: 5, now: NOW })
    expect(outcome).toEqual({
      ok: false,
      code: 'unavailable',
      message: unavailableMessage('at-capacity'),
    })
  })
})

/**
 * Which closed dates are read for a booking. It used to be every closure not
 * yet over, cut to 50 rows in no order, so a venue with more than 50 future
 * closed days could have the relevant one left out and be booked on it.
 */
describe('closedPeriods', () => {
  const asked = async (start: string, end: string) => {
    const find = vi.fn(async () => ({ docs: [] }))
    await closedPeriods({ find } as unknown as Payload, 7, new Date(start), new Date(end))
    return (find.mock.calls[0] as unknown as [{ where: unknown; limit: number }])[0]
  }

  it('asks only for closures overlapping the evening of a table booking', async () => {
    // 20:00 to 22:00 Beirut on 18 October (UTC+3).
    const query = await asked('2026-10-18T17:00:00.000Z', '2026-10-18T19:00:00.000Z')
    expect(query.where).toEqual({
      and: [
        { business: { equals: 7 } },
        { startsOn: { less_than_equal: '2026-10-18' } },
        { endsOn: { greater_than_equal: '2026-10-18' } },
      ],
    })
  })

  it('asks for the nights of a stay, not the morning it leaves', async () => {
    // In on the 18th, out on the morning of the 21st: nights of the 18th to 20th.
    const query = await asked('2026-10-18T12:00:00.000Z', '2026-10-21T08:00:00.000Z')
    expect(query.where).toEqual({
      and: [
        { business: { equals: 7 } },
        { startsOn: { less_than_equal: '2026-10-20' } },
        { endsOn: { greater_than_equal: '2026-10-18' } },
      ],
    })
  })
})
