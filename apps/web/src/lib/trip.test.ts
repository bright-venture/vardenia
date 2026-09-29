import { describe, expect, it } from 'vitest'
import { parseTrip, prefillFromTrip, tripInterval, tripParams, type Trip } from './trip'
import { tripVerdictFor, verdictFrom } from './trip-availability'
import { bookingFormModel } from './booking-form'
import { filterHref, parseFilterState } from '../components/ListingFilters'

const NOW = new Date('2026-10-01T09:00:00Z')
const trip = (over: Partial<Trip> = {}): Trip => ({
  date: '2026-10-03',
  time: '20:00',
  nights: 1,
  party: 4,
  ...over,
})

describe('parseTrip', () => {
  it('reads a full plan', () => {
    expect(
      parseTrip({ date: '2026-10-03', time: '19:30', nights: '3', party: '6' }, '2026-10-01'),
    ).toEqual({ date: '2026-10-03', time: '19:30', nights: 3, party: 6 })
  })

  it('is no plan at all without a real date', () => {
    expect(parseTrip({ party: '4' })).toBeNull()
    expect(parseTrip({ date: '2026-02-31' })).toBeNull()
    expect(parseTrip({ date: 'saturday' })).toBeNull()
  })

  it('drops a day already gone, or more than a year away', () => {
    expect(parseTrip({ date: '2026-09-30' }, '2026-10-01')).toBeNull()
    expect(parseTrip({ date: '2027-10-02' }, '2026-10-01')).toBeNull()
    expect(parseTrip({ date: '2026-10-01' }, '2026-10-01')).not.toBeNull()
  })

  it('falls back on anything malformed rather than guessing', () => {
    expect(parseTrip({ date: '2026-10-03', time: '25:00', nights: '0', party: '4.5' })).toEqual({
      date: '2026-10-03',
      time: null,
      nights: 1,
      party: 2,
    })
    expect(parseTrip({ date: '2026-10-03', party: '500' })?.party).toBe(2)
  })
})

describe('tripParams', () => {
  it('builds one fixed order, leaving out one night', () => {
    expect(tripParams(trip())).toEqual([
      ['date', '2026-10-03'],
      ['time', '20:00'],
      ['party', '4'],
    ])
    expect(tripParams(trip({ time: null, nights: 2 }))).toEqual([
      ['date', '2026-10-03'],
      ['nights', '2'],
      ['party', '4'],
    ])
  })
})

describe('filters carry the plans', () => {
  it('appends them after the filters, and round-trips', () => {
    const state = parseFilterState(
      { where: 'beirut', book: '1', date: '2099-01-01', party: '3' },
      [],
    )
    // A date far ahead is dropped against today, so build a near one instead.
    expect(state.trip).toBeNull()
    expect(state.bookable).toBe(true)

    const href = filterHref('/stay', { amenities: [], governorate: 'beirut' }, { trip: trip() })
    expect(href).toBe('/stay?where=beirut&date=2026-10-03&time=20:00&party=4')
  })
})

describe('prefillFromTrip', () => {
  const table = bookingFormModel(
    { enabled: true, minDurationMinutes: 90, maxDurationMinutes: 180, maxPartySize: 4 },
    NOW,
  )
  const stay = bookingFormModel(
    { enabled: true, minDurationMinutes: 1440, maxDurationMinutes: 1440 * 5 },
    NOW,
  )

  it('keeps the defaults with no plan', () => {
    expect(prefillFromTrip(table, null)).toEqual({
      date: table.earliestDate,
      time: '20:00',
      nights: 1,
      partySize: table.defaultPartySize,
    })
  })

  it('fills in the day, time and party', () => {
    expect(prefillFromTrip(table, trip({ time: '13:00', party: 3 }))).toMatchObject({
      date: '2026-10-03',
      time: '13:00',
      partySize: 3,
    })
  })

  it('keeps a party over the limit, so the form can say so', () => {
    expect(prefillFromTrip(table, trip({ party: 9 })).partySize).toBe(9)
  })

  it('does not carry a day the listing cannot take', () => {
    expect(prefillFromTrip(table, trip({ date: '2026-09-01' })).date).toBe(table.earliestDate)
  })

  it('takes the nearest stay the listing offers', () => {
    expect(prefillFromTrip(stay, trip({ nights: 3 })).nights).toBe(3)
    expect(prefillFromTrip(stay, trip({ nights: 9 })).nights).toBe(5)
  })
})

describe('tripInterval', () => {
  it('checks a table at the time asked, for the shortest sitting', () => {
    const interval = tripInterval(trip(), { enabled: true, minDurationMinutes: 90 }, NOW)
    // 20:00 in Beirut in October is 17:00 UTC.
    expect(interval?.start.toISOString()).toBe('2026-10-03T17:00:00.000Z')
    expect(interval?.end.toISOString()).toBe('2026-10-03T18:30:00.000Z')
  })

  it('checks a stay from check-in for the nights asked', () => {
    const interval = tripInterval(
      trip({ nights: 2 }),
      { enabled: true, minDurationMinutes: 1440 },
      NOW,
    )
    expect(interval?.start.toISOString()).toBe('2026-10-03T12:00:00.000Z')
    expect(interval?.end.toISOString()).toBe('2026-10-05T08:00:00.000Z')
  })
})

describe('tripVerdictFor', () => {
  const listing = (booking: unknown) => ({ id: 1, booking, openingHours: null })
  const rules = { enabled: true, capacity: 1, minDurationMinutes: 90, maxPartySize: 4 }

  it('says nothing for a place that does not take bookings', () => {
    expect(tripVerdictFor(listing({ enabled: false }), trip(), [], [], NOW)).toBeNull()
    expect(tripVerdictFor(listing(null), trip(), [], [], NOW)).toBeNull()
  })

  it('is free when nothing is in the way', () => {
    expect(tripVerdictFor(listing(rules), trip(), [], [], NOW)).toEqual({ kind: 'free' })
  })

  it('is full when the capacity is taken', () => {
    const taken = [
      {
        start: new Date('2026-10-03T16:30:00Z'),
        end: new Date('2026-10-03T18:30:00Z'),
        status: 'confirmed' as const,
      },
    ]
    expect(tripVerdictFor(listing(rules), trip(), taken, [], NOW)).toEqual({ kind: 'full' })
  })

  it('is closed on a day the venue shut', () => {
    const shut = [{ startsOn: '2026-10-02', endsOn: '2026-10-04' }]
    expect(tripVerdictFor(listing(rules), trip(), [], shut, NOW)).toEqual({ kind: 'closed' })
  })

  it('names a party the place cannot seat', () => {
    expect(tripVerdictFor(listing(rules), trip({ party: 8 }), [], [], NOW)).toEqual({
      kind: 'party',
    })
  })
})

describe('verdictFrom', () => {
  it('reduces the reasons to what a card says', () => {
    expect(verdictFrom({ ok: false, reason: 'too-soon' })).toEqual({ kind: 'notice' })
    expect(verdictFrom({ ok: false, reason: 'too-far-ahead' })).toEqual({ kind: 'other' })
  })
})
