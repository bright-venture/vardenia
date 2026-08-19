import { describe, expect, it } from 'vitest'
import {
  bookingFormModel,
  CHECK_IN,
  CHECK_OUT,
  durationChoices,
  durationLabel,
  nightChoices,
  toInterval,
} from './booking-form'
import type { BookingRules } from './availability'

/**
 * What the form asks for, decided from seven numbers in the CMS.
 *
 * The cases worth having are the ones nobody clicks through in testing: a
 * listing whose booking group is empty, one whose party sizes were typed the
 * wrong way round, one whose lead time pushes the first bookable day into next
 * week. Each of those renders a form that is subtly unusable rather than
 * visibly broken, which is why they are asserted rather than eyeballed.
 */

const NOW = new Date('2026-09-01T09:00:00Z') // midday in Beirut

const restaurant: BookingRules = {
  enabled: true,
  capacity: 12,
  minPartySize: 1,
  maxPartySize: 8,
  leadTimeMinutes: 60,
  maxAdvanceDays: 90,
  minDurationMinutes: 90,
  maxDurationMinutes: 240,
}

const hotel: BookingRules = {
  enabled: true,
  capacity: 30,
  minPartySize: 1,
  maxPartySize: 4,
  leadTimeMinutes: 1440,
  maxAdvanceDays: 365,
  minDurationMinutes: 1440,
  maxDurationMinutes: 1440 * 14,
}

describe('bookingFormModel', () => {
  it('asks for a sitting when the shortest booking is under a day', () => {
    expect(bookingFormModel(restaurant, NOW).mode).toBe('sitting')
  })

  it('asks for nights when the shortest booking is a whole day', () => {
    expect(bookingFormModel(hotel, NOW).mode).toBe('nights')
  })

  /**
   * The threshold is exactly 1440, and a place selling a 23-hour minimum is
   * still a sitting. Asserted because the boundary is the whole rule.
   */
  it('treats 1439 minutes as a sitting and 1440 as a stay', () => {
    const rules = (min: number): BookingRules => ({ ...restaurant, minDurationMinutes: min })
    expect(bookingFormModel(rules(1439), NOW).mode).toBe('sitting')
    expect(bookingFormModel(rules(1440), NOW).mode).toBe('nights')
  })

  it('opens the calendar today when no notice is required', () => {
    const model = bookingFormModel({ ...restaurant, leadTimeMinutes: 0 }, NOW)
    expect(model.earliestDate).toBe('2026-09-01')
  })

  it('pushes the first bookable day out by whole days of notice', () => {
    const model = bookingFormModel({ ...restaurant, leadTimeMinutes: 3 * 1440 }, NOW)
    expect(model.earliestDate).toBe('2026-09-04')
  })

  /**
   * An hour of notice must not remove today from the calendar. It rules out the
   * next hour, which is a time, and a date input cannot express that - so the
   * day stays selectable and checkAvailability refuses the specific slot.
   */
  it('keeps today available for a lead time shorter than a day', () => {
    expect(bookingFormModel(restaurant, NOW).earliestDate).toBe('2026-09-01')
  })

  it('closes the calendar at the advance limit', () => {
    const model = bookingFormModel({ ...restaurant, maxAdvanceDays: 30 }, NOW)
    expect(model.latestDate).toBe('2026-10-01')
  })

  it('swaps party sizes that were entered the wrong way round', () => {
    const model = bookingFormModel({ ...restaurant, minPartySize: 10, maxPartySize: 2 }, NOW)
    expect(model.minPartySize).toBe(2)
    expect(model.maxPartySize).toBe(10)
  })

  it('never defaults the party size outside its own bounds', () => {
    const solo = bookingFormModel({ ...restaurant, minPartySize: 1, maxPartySize: 1 }, NOW)
    expect(solo.defaultPartySize).toBe(1)

    const group = bookingFormModel({ ...restaurant, minPartySize: 6, maxPartySize: 20 }, NOW)
    expect(group.defaultPartySize).toBe(6)
  })

  it('defaults to two people where that is allowed', () => {
    expect(bookingFormModel(restaurant, NOW).defaultPartySize).toBe(2)
  })

  /**
   * A listing with `enabled: true` and nothing else filled in. Every value falls
   * back through resolveRules, and the form must still be usable rather than
   * rendering empty dropdowns.
   */
  it('builds a usable form from an otherwise empty booking group', () => {
    const model = bookingFormModel({ enabled: true }, NOW)
    expect(model.mode).toBe('sitting')
    expect(model.durationOptions.length).toBeGreaterThan(0)
    expect(model.minPartySize).toBeGreaterThanOrEqual(1)
    expect(model.maxPartySize).toBeGreaterThanOrEqual(model.minPartySize)
  })

  it('offers no night options in sitting mode and no durations in nights mode', () => {
    expect(bookingFormModel(restaurant, NOW).nightOptions).toEqual([])
    expect(bookingFormModel(hotel, NOW).durationOptions).toEqual([])
  })
})

describe('durationChoices', () => {
  it('steps from the minimum in half hours', () => {
    expect(durationChoices(90, 240)).toEqual([90, 120, 150, 180, 210, 240])
  })

  it('snaps to the half hour after an awkward minimum', () => {
    // Not 15, 45, 75, 105 - which is what stepping *from* the minimum gives, and
    // is a column of numbers nobody thinks in.
    expect(durationChoices(15, 120)).toEqual([15, 30, 60, 90, 120])
  })

  it('does not offer a minimum that is already on the grid twice', () => {
    expect(durationChoices(120, 240)).toEqual([120, 150, 180, 210, 240])
  })

  it('includes the maximum even when the grid misses it', () => {
    expect(durationChoices(60, 200)).toContain(200)
  })

  it('caps a very wide range rather than rendering a hundred options', () => {
    expect(durationChoices(30, 60 * 100).length).toBeLessThanOrEqual(12)
  })

  it('survives a maximum below the minimum', () => {
    expect(durationChoices(120, 60)).toEqual([120])
  })
})

describe('nightChoices', () => {
  it('counts whole nights', () => {
    expect(nightChoices(1440, 1440 * 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('offers at least one night even when the numbers say otherwise', () => {
    expect(nightChoices(1440, 600)).toEqual([1])
  })

  it('caps a year-long maximum', () => {
    expect(nightChoices(1440, 1440 * 365).length).toBeLessThanOrEqual(12)
  })
})

describe('toInterval', () => {
  it('builds a sitting from a Beirut wall clock', () => {
    expect(
      toInterval({ mode: 'sitting', date: '2026-09-01', time: '20:00', durationMinutes: 120 }),
    ).toEqual({ start: '2026-09-01T17:00:00.000Z', end: '2026-09-01T19:00:00.000Z' })
  })

  /**
   * Half-open, so two nights runs from check-in on the first day to check-out on
   * the third. The following guest's stay starts that same afternoon and the two
   * do not overlap - which is the entire reason bookings are intervals rather
   * than a start plus a night count.
   */
  it('builds a stay that ends on the checkout morning', () => {
    const interval = toInterval({ mode: 'nights', date: '2026-09-01', nights: 2 })
    expect(interval?.start).toBe('2026-09-01T12:00:00.000Z') // 15:00 Beirut
    expect(interval?.end).toBe('2026-09-03T08:00:00.000Z') // 11:00 Beirut
  })

  it('uses the documented check-in and check-out times', () => {
    expect(CHECK_IN).toBe('15:00')
    expect(CHECK_OUT).toBe('11:00')
  })

  it('keeps a sitting the length it was asked for across a clock change', () => {
    // The evening the clocks go forward. Two hours is two hours; only the start
    // is pinned to the wall clock.
    const interval = toInterval({
      mode: 'sitting',
      date: '2026-03-28',
      time: '23:00',
      durationMinutes: 120,
    })
    const start = new Date(interval!.start).getTime()
    const end = new Date(interval!.end).getTime()
    expect(end - start).toBe(120 * 60_000)
  })

  it.each([
    [{ mode: 'sitting' as const, date: '2026-09-01', time: '', durationMinutes: 120 }],
    [{ mode: 'sitting' as const, date: '', time: '20:00', durationMinutes: 120 }],
    [{ mode: 'sitting' as const, date: '2026-09-01', time: '20:00', durationMinutes: 0 }],
    [{ mode: 'nights' as const, date: '2026-09-01', nights: 0 }],
    [{ mode: 'nights' as const, date: 'soon', nights: 2 }],
  ])('refuses to build an interval from %j', (input) => {
    expect(toInterval(input)).toBeNull()
  })
})

describe('durationLabel', () => {
  it.each([
    [60, '1 hour'],
    [120, '2 hours'],
    [90, '1 hour 30 minutes'],
    [45, '45 minutes'],
  ])('writes %i minutes as "%s"', (minutes, expected) => {
    expect(durationLabel(minutes, 'en')).toBe(expected)
  })

  it('writes Arabic without falling back to English', () => {
    expect(durationLabel(120, 'ar')).not.toContain('hour')
    expect(durationLabel(45, 'ar')).not.toContain('minutes')
  })
})
