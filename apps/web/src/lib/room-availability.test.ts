import { describe, expect, it } from 'vitest'
import {
  checkRoomRequest,
  hotelHasSpace,
  nightlyFree,
  roomStayInterval,
  roomsLeft,
  stayNights,
  typeMatches,
  type ExistingRoomBooking,
  type RoomTypeInventory,
} from './room-availability'

const RULES = { enabled: true, minDurationMinutes: 1440, maxDurationMinutes: 1440 * 30 }
const NOW = new Date('2026-12-01T09:00:00Z')

const twin: RoomTypeInventory = {
  id: 1,
  name: 'Deluxe Twin',
  rooms: 2,
  sleepsAdults: 2,
  kind: 'room',
  views: ['city'],
  options: [
    { id: 'a', breakfast: false, cancellation: 'non-refundable' },
    { id: 'b', breakfast: true, cancellation: 'free' },
  ],
}
const suite: RoomTypeInventory = {
  id: 2,
  name: 'Sea Suite',
  rooms: 1,
  sleepsAdults: 2,
  sleepsChildren: 1,
  kind: 'suite',
  views: ['sea'],
  options: [{ id: 'c', breakfast: false, cancellation: 'free' }],
}

const stay = (date: string, nights: number) => roomStayInterval(date, nights, RULES)!

const booked = (
  date: string,
  nights: number,
  lines: { roomType: number; count: number }[],
): ExistingRoomBooking => ({
  ...stay(date, nights),
  status: 'confirmed',
  lines,
})

describe('nights', () => {
  it('holds the arrival night up to the night before departure', () => {
    const { start, end } = stay('2026-12-24', 2)
    expect(stayNights(start, end)).toEqual(['2026-12-24', '2026-12-25'])
  })

  it('uses the hotel check-in and check-out times', () => {
    const interval = roomStayInterval('2026-12-24', 1, {
      checkInTime: '14:00',
      checkOutTime: '12:00',
    })!
    expect(interval.start.toISOString()).toBe('2026-12-24T12:00:00.000Z')
    expect(interval.end.toISOString()).toBe('2026-12-25T10:00:00.000Z')
  })
})

describe('rooms left', () => {
  it('counts the busiest night of the stay', () => {
    const existing = [booked('2026-12-25', 1, [{ roomType: 1, count: 2 }])]
    expect(roomsLeft(twin, existing, stay('2026-12-24', 1))).toBe(2)
    expect(roomsLeft(twin, existing, stay('2026-12-24', 2))).toBe(0)
  })

  it('frees the room on the morning a guest leaves', () => {
    const existing = [booked('2026-12-23', 1, [{ roomType: 1, count: 2 }])]
    expect(roomsLeft(twin, existing, stay('2026-12-24', 1))).toBe(2)
  })

  it('ignores cancelled bookings and other room types', () => {
    const existing: ExistingRoomBooking[] = [
      { ...booked('2026-12-24', 1, [{ roomType: 1, count: 2 }]), status: 'cancelled' },
      booked('2026-12-24', 1, [{ roomType: 2, count: 1 }]),
    ]
    expect(roomsLeft(twin, existing, stay('2026-12-24', 1))).toBe(2)
  })
})

describe('a room request', () => {
  const check = (
    lines: { roomType: number; count: number; option?: string }[],
    guests: number,
    existing: ExistingRoomBooking[] = [],
  ) =>
    checkRoomRequest({
      rules: RULES,
      types: [twin, suite],
      existing,
      request: { interval: stay('2026-12-24', 2), guests, lines },
      now: NOW,
    })

  it('books rooms of several types at once', () => {
    expect(
      check(
        [
          { roomType: 1, count: 2, option: 'b' },
          { roomType: 2, count: 1 },
        ],
        6,
      ),
    ).toEqual({ ok: true })
  })

  it('refuses more rooms than are left', () => {
    const existing = [booked('2026-12-25', 1, [{ roomType: 1, count: 1 }])]
    expect(check([{ roomType: 1, count: 2 }], 2, existing)).toMatchObject({
      ok: false,
      reason: 'rooms-full',
    })
  })

  it('refuses a party the rooms cannot sleep', () => {
    expect(check([{ roomType: 1, count: 1 }], 3)).toMatchObject({
      ok: false,
      reason: 'rooms-too-small',
    })
  })

  it('refuses a room type or option the hotel does not offer', () => {
    expect(check([{ roomType: 9, count: 1 }], 1)).toMatchObject({ reason: 'room-unknown' })
    expect(check([{ roomType: 1, count: 1, option: 'zz' }], 1)).toMatchObject({
      reason: 'room-unknown',
    })
  })

  it('refuses no rooms at all', () => {
    expect(check([], 2)).toMatchObject({ reason: 'no-rooms-chosen' })
  })

  it('applies the hotel closed dates, not opening hours', () => {
    expect(
      checkRoomRequest({
        rules: RULES,
        closures: [{ startsOn: '2026-12-25', endsOn: '2026-12-25' }],
        types: [twin],
        existing: [],
        request: { interval: stay('2026-12-24', 2), guests: 2, lines: [{ roomType: 1, count: 1 }] },
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'closed-period' })
  })
})

describe('filters', () => {
  it('needs breakfast and free cancellation on the same option', () => {
    expect(typeMatches(twin, { breakfast: true, freeCancellation: true })).toBe(true)
    expect(
      typeMatches(
        {
          ...twin,
          options: [
            { id: 'x', breakfast: true, cancellation: 'non-refundable' },
            { id: 'y', cancellation: 'free' },
          ],
        },
        { breakfast: true, freeCancellation: true },
      ),
    ).toBe(false)
  })

  it('needs the sea view and the breakfast on the same room type', () => {
    const interval = stay('2026-12-24', 1)
    expect(
      hotelHasSpace(
        [twin, suite],
        [],
        interval,
        { guests: 2, rooms: 1 },
        { view: 'sea', breakfast: true },
      ),
    ).toBe(false)
    expect(
      hotelHasSpace([twin, suite], [], interval, { guests: 2, rooms: 1 }, { view: 'sea' }),
    ).toBe(true)
  })

  it('needs enough rooms of one type for the party', () => {
    const interval = stay('2026-12-24', 1)
    expect(hotelHasSpace([twin, suite], [], interval, { guests: 4, rooms: 2 })).toBe(true)
    expect(hotelHasSpace([twin, suite], [], interval, { guests: 5, rooms: 2 })).toBe(false)
  })
})

describe('a hotel whose rules were set up for sittings', () => {
  it('still takes a night', () => {
    expect(
      checkRoomRequest({
        rules: { enabled: true, minDurationMinutes: 60, maxDurationMinutes: 120 },
        types: [twin],
        existing: [],
        request: { interval: stay('2026-12-24', 1), guests: 2, lines: [{ roomType: 1, count: 1 }] },
        now: NOW,
      }),
    ).toEqual({ ok: true })
  })
})

describe('open dates (closed until the hotel opens them)', () => {
  const withPeriods = (periods: RoomTypeInventory['periods']): RoomTypeInventory => ({
    ...twin,
    rooms: 5,
    periods,
  })

  it('is closed on nights no period covers', () => {
    expect(roomsLeft(withPeriods([]), [], stay('2026-12-13', 1))).toBe(0)
  })

  it('sells the rooms the period opens, night by night', () => {
    const type = withPeriods([{ id: 1, startsOn: '2026-12-13', endsOn: '2026-12-19', rooms: 5 }])
    const existing = [booked('2026-12-13', 1, [{ roomType: 1, count: 1 }])]
    expect(roomsLeft(type, existing, stay('2026-12-13', 7))).toBe(4)
    expect(nightlyFree(type, existing, stay('2026-12-13', 3))).toEqual([
      { night: '2026-12-13', free: 4 },
      { night: '2026-12-14', free: 5 },
      { night: '2026-12-15', free: 5 },
    ])
    // The 20th is not open, so a stay through it is not available.
    expect(roomsLeft(type, existing, stay('2026-12-14', 7))).toBe(0)
  })

  it('lets the last-saved period win, so 0 closes nights inside a season', () => {
    const type = withPeriods([
      { id: 1, startsOn: '2026-12-01', endsOn: '2026-12-31', rooms: 5 },
      { id: 2, startsOn: '2026-12-24', endsOn: '2026-12-25', rooms: 0 },
    ])
    expect(roomsLeft(type, [], stay('2026-12-20', 2))).toBe(5)
    expect(roomsLeft(type, [], stay('2026-12-23', 2))).toBe(0)
  })

  it('never sells more than the room type has', () => {
    const type = withPeriods([{ id: 1, startsOn: '2026-12-01', endsOn: '2026-12-31', rooms: 9 }])
    expect(roomsLeft(type, [], stay('2026-12-10', 1))).toBe(5)
  })
})
