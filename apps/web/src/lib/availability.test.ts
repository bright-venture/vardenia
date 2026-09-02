import { describe, expect, it } from 'vitest'
import {
  checkAvailability,
  resolveRules,
  unavailableMessage,
  UNAVAILABLE_REASONS,
  type BookingRules,
  type ClosedPeriod,
  type ExistingBooking,
} from './availability'
import type { OpeningHour } from './hours'

/**
 * The availability engine, which is where a booking system is won or lost.
 *
 * Every case here is one somebody hits in the first week: a party of one at a
 * venue with a minimum, a request at 22:00 on a Saturday whose kitchen shuts at
 * 23:00, a hotel stay spanning nights the restaurant downstairs is closed, and
 * the two people who click "book" on the last table at the same moment.
 *
 * `now` is injected everywhere. A test that depends on the real clock passes
 * until the day it is run at the wrong hour.
 */

const NOW = new Date('2026-09-01T09:00:00Z')
const at = (iso: string) => new Date(iso)

/** Open 09:00-23:00 every day, in Beirut. */
const ALWAYS_OPEN: OpeningHour[] = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map(
  (day) => ({ day, opens: '09:00', closes: '23:00' }),
)

const ENABLED: BookingRules = { enabled: true, capacity: 1 }

const check = (overrides: {
  rules?: BookingRules | null
  hours?: OpeningHour[] | null
  closures?: ClosedPeriod[] | null
  existing?: ExistingBooking[]
  start?: string
  end?: string
  partySize?: number
  excludeBookingId?: string | number
  now?: Date
}) =>
  checkAvailability({
    closures: overrides.closures,
    /**
     * `'rules' in overrides` rather than `overrides.rules ?? ENABLED`.
     *
     * The `??` version silently replaced an explicitly-passed `undefined` or
     * `null` with the enabled config - which is exactly the value the "absent
     * config is disabled" tests were trying to pass. The helper was defeating
     * the case under test and the suite went green on it.
     */
    rules: 'rules' in overrides ? overrides.rules : ENABLED,
    hours: overrides.hours === undefined ? ALWAYS_OPEN : overrides.hours,
    existing: overrides.existing ?? [],
    now: overrides.now ?? NOW,
    request: {
      interval: {
        start: at(overrides.start ?? '2026-09-01T18:00:00Z'),
        end: at(overrides.end ?? '2026-09-01T20:00:00Z'),
      },
      partySize: overrides.partySize ?? 2,
      excludeBookingId: overrides.excludeBookingId,
    },
  })

describe('the happy path', () => {
  it('accepts a normal booking', () => {
    expect(check({})).toEqual({ ok: true })
  })
})

describe('bookings switched off', () => {
  /**
   * Reported before anything else, and deliberately. Telling someone a place is
   * fully booked when it simply does not take bookings sends them back to try
   * another time for a table that will never exist.
   */
  it('is reported ahead of every other reason', () => {
    const result = check({
      rules: { enabled: false },
      start: '2020-01-01T00:00:00Z',
      partySize: 999,
      existing: [
        { start: at('2026-09-01T18:00:00Z'), end: at('2026-09-01T20:00:00Z'), status: 'confirmed' },
      ],
    })
    expect(result).toEqual({ ok: false, reason: 'bookings-disabled' })
  })

  /** Absent config is off, not on. A half-filled listing must not accept bookings. */
  it.each([undefined, null, {}, { enabled: null }, { capacity: 5 }])(
    'treats %o as disabled',
    (rules) => {
      expect(check({ rules: rules as BookingRules })).toEqual({
        ok: false,
        reason: 'bookings-disabled',
      })
    },
  )
})

describe('time', () => {
  it('refuses a booking in the past', () => {
    const result = check({ start: '2026-08-30T18:00:00Z', end: '2026-08-30T20:00:00Z' })
    expect(result).toMatchObject({ ok: false, reason: 'in-the-past' })
  })

  it('refuses an interval that ends before it starts', () => {
    const result = check({ start: '2026-09-01T20:00:00Z', end: '2026-09-01T18:00:00Z' })
    expect(result).toMatchObject({ ok: false, reason: 'invalid-interval' })
  })

  it('refuses a zero-length interval', () => {
    const result = check({ start: '2026-09-01T18:00:00Z', end: '2026-09-01T18:00:00Z' })
    expect(result).toMatchObject({ ok: false, reason: 'invalid-interval' })
  })

  it('enforces the notice a place needs', () => {
    const rules = { ...ENABLED, leadTimeMinutes: 120 }
    // NOW is 09:00; 10:00 is only an hour's notice.
    expect(
      check({ rules, start: '2026-09-01T10:00:00Z', end: '2026-09-01T12:00:00Z' }),
    ).toMatchObject({ ok: false, reason: 'too-soon', detail: { requiredMinutes: 120 } })
    expect(check({ rules, start: '2026-09-01T12:00:00Z', end: '2026-09-01T14:00:00Z' })).toEqual({
      ok: true,
    })
  })

  it('closes the calendar beyond the advance window', () => {
    const rules = { ...ENABLED, maxAdvanceDays: 30 }
    expect(
      check({ rules, start: '2026-12-01T18:00:00Z', end: '2026-12-01T20:00:00Z' }),
    ).toMatchObject({ ok: false, reason: 'too-far-ahead', detail: { maxDays: 30 } })
  })

  it('enforces a minimum and maximum duration', () => {
    const rules = { ...ENABLED, minDurationMinutes: 60, maxDurationMinutes: 240 }
    expect(
      check({ rules, start: '2026-09-01T18:00:00Z', end: '2026-09-01T18:30:00Z' }),
    ).toMatchObject({ ok: false, reason: 'too-short' })
    expect(
      check({ rules, start: '2026-09-01T12:00:00Z', end: '2026-09-01T20:00:00Z' }),
    ).toMatchObject({ ok: false, reason: 'too-long' })
  })
})

describe('party size', () => {
  it('enforces a minimum', () => {
    const rules = { ...ENABLED, minPartySize: 2 }
    expect(check({ rules, partySize: 1 })).toMatchObject({
      ok: false,
      reason: 'party-too-small',
      detail: { minPartySize: 2 },
    })
  })

  it('enforces a maximum', () => {
    const rules = { ...ENABLED, maxPartySize: 6 }
    expect(check({ rules, partySize: 8 })).toMatchObject({
      ok: false,
      reason: 'party-too-large',
      detail: { maxPartySize: 6 },
    })
  })

  it.each([0, -3, Number.NaN])('refuses a party size of %o rather than accepting it', (size) => {
    expect(check({ partySize: size })).toMatchObject({ ok: false, reason: 'party-too-small' })
  })

  it('floors a fractional party size rather than throwing', () => {
    expect(check({ partySize: 2.7 })).toEqual({ ok: true })
  })
})

describe('opening hours', () => {
  /** Beirut is UTC+3 in September, so 21:00 UTC is midnight local - after closing. */
  it('refuses a time the business is closed', () => {
    expect(check({ start: '2026-09-01T21:30:00Z', end: '2026-09-01T22:30:00Z' })).toMatchObject({
      ok: false,
      reason: 'closed',
    })
  })

  it('accepts a time inside the window', () => {
    expect(check({ start: '2026-09-01T15:00:00Z', end: '2026-09-01T17:00:00Z' })).toEqual({
      ok: true,
    })
  })

  /**
   * No published hours is not the same as closed. A business that has switched
   * bookings on has told us it wants them; refusing every request because a
   * field is blank would be the system arguing with its own owner.
   */
  it.each([null, undefined, []])('accepts when hours are %o, which means unknown', (hours) => {
    expect(check({ hours: hours as OpeningHour[] | null })).toEqual({ ok: true })
  })

  /**
   * Only the start is checked. A dinner booked at 21:00 legitimately runs past a
   * 23:00 closing while guests finish, and a hotel stay spans every closed night
   * in between. Requiring the end to be inside opening hours rejects both.
   */
  it('does not require the end to fall inside opening hours', () => {
    const result = check({ start: '2026-09-01T19:00:00Z', end: '2026-09-02T09:00:00Z' })
    expect(result).toEqual({ ok: true })
  })

  it('refuses a day marked closed', () => {
    const closedTuesday: OpeningHour[] = ALWAYS_OPEN.map((h) =>
      h.day === 'tue' ? { day: 'tue', closed: true } : h,
    )
    // 2026-09-01 is a Tuesday.
    expect(check({ hours: closedTuesday })).toMatchObject({ ok: false, reason: 'closed' })
  })
})

/**
 * Closed dates: the fortnight in August, the refurbishment, the wedding.
 *
 * Every boundary here is one a venue hits the first time they use it. Inclusive
 * ends are the one that costs money if it is wrong: "closed the 14th to the
 * 16th" means three days shut, and a half-open range quietly takes a booking on
 * the 16th at a restaurant with the shutters down.
 *
 * The dates are Beirut calendar days, which is why the instants below are
 * written in UTC and the assertions are about the Lebanese day they fall on.
 */
describe('closed dates', () => {
  /** 2026-09-01T18:00Z is 21:00 on the 1st in Beirut. */
  const on = (startsOn: string, endsOn = startsOn): ClosedPeriod[] => [{ startsOn, endsOn }]

  it('refuses a booking on a day the venue has closed', () => {
    expect(check({ closures: on('2026-09-01') })).toMatchObject({
      ok: false,
      reason: 'closed-period',
    })
  })

  it('takes a booking the day before and the day after', () => {
    const shut = on('2026-09-02')
    expect(check({ closures: shut })).toEqual({ ok: true })
    expect(
      check({
        closures: shut,
        start: '2026-09-03T18:00:00Z',
        end: '2026-09-03T20:00:00Z',
      }),
    ).toEqual({ ok: true })
  })

  /** Both ends are shut, not just the middle. */
  it.each([
    ['the first day', '2026-09-01T18:00:00Z'],
    ['a day in the middle', '2026-09-02T18:00:00Z'],
    ['the last day', '2026-09-03T18:00:00Z'],
  ])('closes %s of an inclusive range', (_label, start) => {
    expect(
      check({
        closures: on('2026-09-01', '2026-09-03'),
        start,
        end: new Date(new Date(start).getTime() + 7_200_000).toISOString(),
      }),
    ).toMatchObject({ ok: false, reason: 'closed-period' })
  })

  it('reopens the day after the range ends', () => {
    expect(
      check({
        closures: on('2026-09-01', '2026-09-03'),
        start: '2026-09-04T18:00:00Z',
        end: '2026-09-04T20:00:00Z',
      }),
    ).toEqual({ ok: true })
  })

  /**
   * The reason the day is computed in Beirut rather than in UTC.
   *
   * 22:00 UTC on the 1st is 01:00 on the 2nd in Lebanon. A venue that closed
   * only the 2nd would take this booking if the comparison used the UTC day,
   * and would find a table sitting down on a night they are shut.
   */
  it('uses the Beirut day, not the UTC one, after midnight', () => {
    expect(
      check({
        closures: on('2026-09-02'),
        start: '2026-09-01T22:00:00Z',
        end: '2026-09-01T23:30:00Z',
        hours: null,
      }),
    ).toMatchObject({ ok: false, reason: 'closed-period' })
  })

  /**
   * A holiday and a closed weekday are both "no" and they are different
   * sentences, so the order they are checked in decides which one the customer
   * reads. "Closed at that time" invites them to try an hour later and be
   * refused again.
   */
  it('says the place is closed for the period rather than shut at that hour', () => {
    const closedTuesday: OpeningHour[] = [{ day: 'tue', closed: true }]
    expect(check({ closures: on('2026-09-01'), hours: closedTuesday })).toMatchObject({
      ok: false,
      reason: 'closed-period',
    })
  })

  /**
   * Controls. None of these may shut a listing, because a malformed date
   * compares with `<=` against real ones and would refuse every booking at a
   * venue that never asked for it.
   */
  it.each([
    ['no closures at all', undefined],
    ['an empty list', []],
    ['null', null],
    ['a range with an impossible day', [{ startsOn: '2026-02-31', endsOn: '2026-02-31' }]],
    [
      'a range with a month that does not exist',
      [{ startsOn: '2026-13-01', endsOn: '2026-13-05' }],
    ],
    ['an empty string', [{ startsOn: '', endsOn: '' }]],
    ['something that is not a date', [{ startsOn: 'august', endsOn: 'august' }]],
  ])('takes the booking with %s', (_label, closures) => {
    expect(check({ closures: closures as ClosedPeriod[] | null | undefined })).toEqual({ ok: true })
  })

  /** It is a closure, not a way to book in the past or at a full venue. */
  it('does not override the checks that come before it', () => {
    expect(check({ closures: on('2026-09-01'), rules: { enabled: false } })).toMatchObject({
      ok: false,
      reason: 'bookings-disabled',
    })

    expect(
      check({
        closures: on('2026-08-01'),
        start: '2026-08-01T18:00:00Z',
        end: '2026-08-01T20:00:00Z',
      }),
    ).toMatchObject({ ok: false, reason: 'in-the-past' })
  })
})

describe('capacity', () => {
  const overlapping = (status: ExistingBooking['status'], id?: number): ExistingBooking => ({
    id,
    start: at('2026-09-01T18:30:00Z'),
    end: at('2026-09-01T19:30:00Z'),
    status,
  })

  it('refuses when the only place is taken', () => {
    expect(check({ existing: [overlapping('confirmed')] })).toMatchObject({
      ok: false,
      reason: 'at-capacity',
      detail: { capacity: 1, taken: 1 },
    })
  })

  /** A request awaiting confirmation still holds the slot. */
  it('counts pending bookings', () => {
    expect(check({ existing: [overlapping('pending')] })).toMatchObject({
      ok: false,
      reason: 'at-capacity',
    })
  })

  it.each(['cancelled', 'no-show', 'completed'] as const)('does not count %s', (status) => {
    expect(check({ existing: [overlapping(status)] })).toEqual({ ok: true })
  })

  it('allows up to capacity and refuses beyond it', () => {
    const rules = { ...ENABLED, capacity: 3 }
    const two = [overlapping('confirmed', 1), overlapping('pending', 2)]
    expect(check({ rules, existing: two })).toEqual({ ok: true })

    const three = [...two, overlapping('confirmed', 3)]
    expect(check({ rules, existing: three })).toMatchObject({ ok: false, reason: 'at-capacity' })
  })

  /** Back-to-back bookings are not conflicts. This is the half-open rule paying off. */
  it('ignores a booking that ends exactly when this one starts', () => {
    const earlier: ExistingBooking = {
      start: at('2026-09-01T16:00:00Z'),
      end: at('2026-09-01T18:00:00Z'),
      status: 'confirmed',
    }
    expect(check({ existing: [earlier] })).toEqual({ ok: true })
  })

  /**
   * Editing a booking must not conflict with itself - otherwise changing the
   * party size on the only table at a restaurant fails as "fully booked".
   */
  it('excludes the booking being edited', () => {
    const self = overlapping('confirmed', 42)
    expect(check({ existing: [self] })).toMatchObject({ ok: false, reason: 'at-capacity' })
    expect(check({ existing: [self], excludeBookingId: 42 })).toEqual({ ok: true })
  })

  it('does not exclude a different booking by accident', () => {
    expect(check({ existing: [overlapping('confirmed', 7)], excludeBookingId: 42 })).toMatchObject({
      ok: false,
      reason: 'at-capacity',
    })
  })
})

describe('resolveRules', () => {
  it('falls back to safe defaults for anything missing', () => {
    const resolved = resolveRules({ enabled: true })
    expect(resolved.capacity).toBe(1)
    expect(resolved.minPartySize).toBe(1)
    expect(resolved.leadTimeMinutes).toBe(0)
  })

  /**
   * A capacity of 0 in the CMS means somebody cleared the field, not that the
   * venue seats nobody. Falling back beats reading it literally and refusing
   * every booking with "fully booked", which looks like a bug in the engine.
   */
  it.each([0, -5, Number.NaN, null, undefined])('ignores a capacity of %o', (capacity) => {
    expect(resolveRules({ enabled: true, capacity }).capacity).toBe(1)
  })

  /** Lead time is different: zero is a real answer, meaning walk-ins welcome. */
  it('keeps a lead time of zero', () => {
    expect(resolveRules({ enabled: true, leadTimeMinutes: 0 }).leadTimeMinutes).toBe(0)
    expect(resolveRules({ enabled: true, leadTimeMinutes: -10 }).leadTimeMinutes).toBe(0)
  })

  it('floors fractional configuration', () => {
    expect(resolveRules({ enabled: true, capacity: 4.9 }).capacity).toBe(4)
  })
})

describe('messages', () => {
  it('has wording for every reason in both languages', () => {
    for (const reason of UNAVAILABLE_REASONS) {
      expect(unavailableMessage(reason, 'en').length).toBeGreaterThan(0)
      expect(unavailableMessage(reason, 'ar')).toMatch(/[؀-ۿ]/)
    }
  })

  /**
   * Machine codes are hyphenated; "closed" is also an ordinary English word, so
   * only the hyphenated ones can be checked for. Catching `at-capacity` in a
   * sentence shown to a customer is the point.
   */
  it('never leaks a machine-readable code to a customer', () => {
    for (const reason of UNAVAILABLE_REASONS) {
      if (!reason.includes('-')) continue
      expect(unavailableMessage(reason, 'en')).not.toContain(reason)
      expect(unavailableMessage(reason, 'ar')).not.toContain(reason)
    }
  })
})
