import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { addDays, beirutDate, beirutInstant } from './beirut'
import { unavailableMessage } from './availability'
import {
  checkStayRequest,
  loadStayConfig,
  stayConfigOf,
  stayFormRules,
  stayInterval,
  wholePropertyRules,
} from './stay-booking'

/**
 * A guest house booked as a whole property (Task 6): one stay at a time,
 * whatever capacity the listing carries, never shorter than the owner's
 * minimum nights and never more guests than their cap. The overlap rule is
 * the same half-open one every booking uses: a stay that leaves on the 12th
 * at 11:00 and one that arrives on the 12th at 15:00 do not meet.
 */

const NOW = new Date('2026-12-01T08:00:00.000Z')
const day = (offset: number) => addDays(beirutDate(NOW), offset)
const at = (date: string, time: string) => beirutInstant(date, time)!

const rules = {
  enabled: true,
  // Deliberately wrong for a guest house: the whole property is one unit.
  capacity: 5,
  // Set up for sittings; a guest house is counted in nights regardless.
  minDurationMinutes: 60,
  maxDurationMinutes: 240,
  maxPartySize: 4,
  checkInTime: '14:00',
  checkOutTime: '12:00',
}

const stay = { nightlyPrice: 200, includedGuests: 4, maxGuests: 10, minNights: 2 }

const interval = (from: number, nights: number) =>
  stayInterval(at(day(from), '09:00'), at(day(from + nights), '09:00'), rules)!

const check = (over: {
  interval?: { start: Date; end: Date }
  adults?: number
  children?: number
  existing?: {
    start: Date
    end: Date
    status: 'confirmed' | 'pending' | 'cancelled'
    id?: number
  }[]
  stay?: Record<string, unknown> | null
  rules?: Record<string, unknown>
  excludeBookingId?: number
}) =>
  checkStayRequest({
    rules: (over.rules ?? rules) as never,
    closures: [],
    existing: over.existing ?? [],
    stay: (over.stay === undefined ? stay : over.stay) as never,
    request: {
      interval: over.interval ?? interval(3, 2),
      adults: over.adults ?? 2,
      children: over.children ?? 0,
      ...(over.excludeBookingId !== undefined ? { excludeBookingId: over.excludeBookingId } : {}),
    },
    now: NOW,
  })

describe('stayInterval', () => {
  it('runs from check-in on the first day to check-out after the nights', () => {
    const got = interval(3, 2)
    expect(got.start.toISOString()).toBe(at(day(3), '14:00').toISOString())
    expect(got.end.toISOString()).toBe(at(day(5), '12:00').toISOString())
  })

  it('uses 15:00 and 11:00 when the listing has no times', () => {
    const got = stayInterval(at(day(3), '20:00'), at(day(4), '08:00'), {})!
    expect(got.start.toISOString()).toBe(at(day(3), '15:00').toISOString())
    expect(got.end.toISOString()).toBe(at(day(4), '11:00').toISOString())
  })
})

describe('checkStayRequest', () => {
  it('books a free stay', () => {
    expect(check({})).toEqual({ ok: true })
  })

  it('refuses a second overlapping stay, whatever capacity says (whole property)', () => {
    const first = interval(3, 2)
    expect(
      check({ existing: [{ ...first, status: 'confirmed' }], interval: interval(4, 2) }),
    ).toMatchObject({
      ok: false,
      reason: 'at-capacity',
    })
    // A pending request holds the property too.
    expect(
      check({ existing: [{ ...first, status: 'pending' }], interval: interval(3, 2) }),
    ).toMatchObject({
      ok: false,
      reason: 'at-capacity',
    })
  })

  it('lets back-to-back stays through (half-open: leave 12:00, arrive 14:00)', () => {
    const first = interval(3, 2)
    expect(
      check({ existing: [{ ...first, status: 'confirmed' }], interval: interval(5, 2) }),
    ).toEqual({
      ok: true,
    })
  })

  it('ignores a cancelled stay and the booking being moved', () => {
    const first = interval(3, 2)
    expect(check({ existing: [{ ...first, status: 'cancelled' }] })).toEqual({ ok: true })
    expect(
      check({ existing: [{ ...first, status: 'confirmed', id: 9 }], excludeBookingId: 9 }),
    ).toEqual({ ok: true })
  })

  it('refuses fewer nights than the owner minimum', () => {
    expect(check({ interval: interval(3, 1) })).toMatchObject({
      ok: false,
      reason: 'below-min-nights',
      detail: { minNights: 2 },
    })
  })

  it('refuses more guests than the cap, counting children unless told not to', () => {
    expect(check({ adults: 9, children: 2 })).toMatchObject({
      ok: false,
      reason: 'party-too-large',
      detail: { maxPartySize: 10 },
    })
    expect(
      check({ adults: 9, children: 2, stay: { ...stay, childrenCountAsGuests: false } }),
    ).toEqual({
      ok: true,
    })
  })

  it('ignores the staff party limit (4 here): the owner cap is the rule for a guest house', () => {
    expect(check({ adults: 8 })).toEqual({ ok: true })
  })

  it('with no stay config, still one stay at a time and one night minimum', () => {
    expect(check({ stay: null, interval: interval(3, 1), adults: 30 })).toEqual({ ok: true })
    const first = interval(3, 1)
    expect(
      check({
        stay: null,
        interval: interval(3, 1),
        existing: [{ ...first, status: 'confirmed' }],
      }),
    ).toMatchObject({ ok: false, reason: 'at-capacity' })
  })

  it('says "does not take bookings" before anything else', () => {
    expect(check({ rules: { ...rules, enabled: false }, interval: interval(3, 1) })).toMatchObject({
      ok: false,
      reason: 'bookings-disabled',
    })
  })
})

describe('wholePropertyRules and stayFormRules', () => {
  it('forces one stay at a time and counts in nights', () => {
    const r = wholePropertyRules(rules as never)
    expect(r.capacity).toBe(1)
    expect(r.minDurationMinutes).toBe(1440)
    expect(r.maxDurationMinutes).toBe(1440 * 30)
  })

  it('keeps night-based limits staff set', () => {
    const r = wholePropertyRules({
      ...rules,
      minDurationMinutes: 2880,
      maxDurationMinutes: 1440 * 7,
    } as never)
    expect(r.minDurationMinutes).toBe(2880)
    expect(r.maxDurationMinutes).toBe(1440 * 7)
  })

  it('gives the Book form nights from minNights and the guest cap as its largest party', () => {
    const r = stayFormRules(rules as never, { minNights: 3, maxGuests: 12 })
    expect(r.minDurationMinutes).toBe(3 * 1440)
    expect(r.maxPartySize).toBe(12)
    expect(r.minPartySize).toBe(1)
  })
})

describe('the minimum nights message', () => {
  it('is its own sentence, in every language', () => {
    expect(unavailableMessage('below-min-nights', 'en')).toMatch(/minimum number of nights/)
    expect(unavailableMessage('below-min-nights', 'ar')).toMatch(new RegExp('[\\u0600-\\u06ff]'))
  })
})

describe('stayConfigOf and loadStayConfig (for Task 7)', () => {
  it('reads the stay group of a getaway, and nothing for other kinds', () => {
    expect(stayConfigOf({ subcategories: ['getaways'], stay: { nightlyPrice: 80 } })).toEqual({
      nightlyPrice: 80,
    })
    expect(stayConfigOf({ subcategories: ['hotels'], stay: { nightlyPrice: 80 } })).toBeNull()
    expect(stayConfigOf({ subcategories: ['getaways'] })).toEqual({})
    expect(stayConfigOf(null)).toBeNull()
  })

  it('loads the listing with access overridden and returns its stay, rules and kind', async () => {
    const findByID = vi.fn(async () => ({
      id: 4,
      subcategories: ['getaways'],
      booking: { enabled: true },
      stay: { nightlyPrice: 90, packages: [{ id: 'a', price: 10, unit: 'per-stay' }] },
    }))
    const loaded = await loadStayConfig({ findByID } as unknown as Payload, 4)
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'businesses', id: 4, overrideAccess: true }),
    )
    expect(loaded).toEqual({
      wholeProperty: true,
      rules: { enabled: true },
      stay: { nightlyPrice: 90, packages: [{ id: 'a', price: 10, unit: 'per-stay' }] },
    })
  })

  it('answers null for a listing that does not exist, and not whole property for a hotel', async () => {
    const missing = { findByID: vi.fn(async () => Promise.reject(new Error('nope'))) }
    expect(await loadStayConfig(missing as unknown as Payload, 4)).toBeNull()
    const hotel = { findByID: vi.fn(async () => ({ id: 4, subcategories: ['hotels'] })) }
    expect(await loadStayConfig(hotel as unknown as Payload, 4)).toEqual({
      wholeProperty: false,
      rules: null,
      stay: null,
    })
  })
})
