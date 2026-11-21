import { describe, expect, it } from 'vitest'
import {
  MAX_SEATING_AREAS,
  SEATING_AREA_KEYS,
  areaCapacityVerdict,
  canHaveSeatingAreas,
  maxConcurrent,
  resolveSeatingArea,
  seatingAreaKey,
  seatingAreaShrinkProblem,
  seatingAreasOf,
  seatingAreasProblem,
  type CapacityRow,
} from './seating'
import { PARTNER_EDITABLE_FIELDS } from './partner-fields'
import { bookingRequestSchema, availabilityQuerySchema } from './booking-request'

/**
 * Restaurant seating areas (Task 8, 20 November 2026).
 */

const at = (h: number) => new Date(Date.UTC(2026, 11, 3, h))

describe('the area key', () => {
  it.each([
    [{ setting: 'indoor', smoking: false }, 'indoor'],
    [{ setting: 'indoor', smoking: true }, 'indoor-smoking'],
    [{ setting: 'outdoor' }, 'outdoor'],
    [{ setting: 'outdoor', smoking: true }, 'outdoor-smoking'],
    [{ setting: 'roof', smoking: true }, null],
    [{}, null],
  ])('%j -> %s', (row, key) => {
    expect(seatingAreaKey(row as never)).toBe(key)
  })

  it('has exactly four keys', () => {
    expect(SEATING_AREA_KEYS).toEqual(['indoor', 'indoor-smoking', 'outdoor', 'outdoor-smoking'])
    expect(MAX_SEATING_AREAS).toBe(8)
  })
})

describe('which listings may have seating areas', () => {
  it('restaurants only', () => {
    expect(canHaveSeatingAreas(['restaurants'])).toBe(true)
    expect(canHaveSeatingAreas(['hotels', 'restaurants'])).toBe(true)
    for (const kinds of [['hotels'], ['getaways'], ['cafes'], [], ['getaways', 'restaurants']]) {
      expect(canHaveSeatingAreas(kinds), kinds.join()).toBe(false)
    }
  })
})

describe('seatingAreasProblem', () => {
  const ok = [
    { setting: 'indoor', smoking: false, tables: 10 },
    { setting: 'outdoor', smoking: true, tables: 4, label: 'Terrace' },
  ]

  it('accepts areas on a restaurant, and none anywhere', () => {
    expect(seatingAreasProblem({ subcategories: ['restaurants'], areas: ok })).toBeNull()
    expect(seatingAreasProblem({ subcategories: ['hotels'], areas: [] })).toBeNull()
    expect(seatingAreasProblem({ subcategories: ['cafes'], areas: null })).toBeNull()
  })

  it.each([['hotels'], ['getaways'], ['cafes']])('refuses areas on %s', (kind) => {
    expect(seatingAreasProblem({ subcategories: [kind], areas: ok })).toMatch(
      /only for restaurants/,
    )
  })

  it('refuses the same area twice, naming it', () => {
    const problem = seatingAreasProblem({
      subcategories: ['restaurants'],
      areas: [
        { setting: 'indoor', smoking: true, tables: 2 },
        { setting: 'indoor', smoking: true, tables: 5 },
      ],
    })
    expect(problem).toMatch(/Indoor, smoking/)
    expect(problem).toMatch(/once/)
  })

  it.each([
    [{ setting: 'indoor', tables: 0 }],
    [{ setting: 'indoor', tables: 2.5 }],
    [{ setting: 'indoor' }],
    [{ setting: 'indoor', tables: -1 }],
    [{ setting: 'roof', tables: 2 }],
  ])('refuses a bad row %j', (row) => {
    expect(seatingAreasProblem({ subcategories: ['restaurants'], areas: [row] })).not.toBeNull()
  })

  it('refuses more than 8 rows', () => {
    const areas = Array.from({ length: 9 }, () => ({ setting: 'indoor', tables: 1 }))
    expect(seatingAreasProblem({ subcategories: ['restaurants'], areas })).toMatch(/8/)
  })
})

describe('seatingAreasOf', () => {
  it('reads the valid rows as areas with their key', () => {
    expect(
      seatingAreasOf({
        subcategories: ['restaurants'],
        seatingAreas: [
          { id: 'a', setting: 'indoor', smoking: false, tables: 10, label: 'Hall' },
          { id: 'b', setting: 'outdoor', smoking: true, tables: 3 },
          { id: 'c', setting: 'outdoor', tables: 0 },
        ],
      }),
    ).toEqual([
      { key: 'indoor', setting: 'indoor', smoking: false, tables: 10, label: 'Hall' },
      { key: 'outdoor-smoking', setting: 'outdoor', smoking: true, tables: 3, label: null },
    ])
  })

  it('ignores areas stored on a listing that is not a restaurant', () => {
    expect(
      seatingAreasOf({
        subcategories: ['hotels'],
        seatingAreas: [{ setting: 'indoor', tables: 4 }],
      }),
    ).toEqual([])
  })

  it('keeps the smaller number of tables of a duplicate, as the database does', () => {
    expect(
      seatingAreasOf({
        subcategories: ['restaurants'],
        seatingAreas: [
          { setting: 'indoor', tables: 9 },
          { setting: 'indoor', tables: 2 },
        ],
      }).map((area) => [area.key, area.tables]),
    ).toEqual([['indoor', 2]])
  })
})

describe('resolveSeatingArea', () => {
  const areas = seatingAreasOf({
    subcategories: ['restaurants'],
    seatingAreas: [
      { setting: 'indoor', tables: 10 },
      { setting: 'outdoor', smoking: true, tables: 2 },
    ],
  })

  it('needs no area where none are defined, and drops one that is sent', () => {
    expect(resolveSeatingArea([], undefined)).toEqual({ ok: true, area: null })
    expect(resolveSeatingArea([], 'indoor')).toEqual({ ok: true, area: null })
  })

  it('requires an area where they are defined', () => {
    expect(resolveSeatingArea(areas, undefined)).toEqual({ ok: false, reason: 'area-required' })
    expect(resolveSeatingArea(areas, '')).toEqual({ ok: false, reason: 'area-required' })
  })

  it('refuses an area the listing does not have', () => {
    expect(resolveSeatingArea(areas, 'outdoor')).toEqual({ ok: false, reason: 'area-unknown' })
    expect(resolveSeatingArea(areas, 'rooftop')).toEqual({ ok: false, reason: 'area-unknown' })
  })

  it('returns the area asked for', () => {
    const found = resolveSeatingArea(areas, 'outdoor-smoking')
    expect(found).toMatchObject({ ok: true, area: { key: 'outdoor-smoking', tables: 2 } })
  })
})

describe('maxConcurrent', () => {
  it('counts the most bookings held at one instant, half-open', () => {
    expect(maxConcurrent([])).toBe(0)
    expect(
      maxConcurrent([
        { start: at(18), end: at(20) },
        { start: at(20), end: at(22) },
      ]),
    ).toBe(1)
    expect(
      maxConcurrent([
        { start: at(18), end: at(21) },
        { start: at(19), end: at(20) },
        { start: at(19), end: at(22) },
        { start: at(21), end: at(23) },
      ]),
    ).toBe(3)
  })
})

describe('seatingAreaShrinkProblem (removing or shrinking an area with bookings)', () => {
  const before = [
    { setting: 'indoor', tables: 5 },
    { setting: 'outdoor', smoking: true, tables: 3 },
  ]
  const bookings = [
    { area: 'outdoor-smoking', start: at(18), end: at(20) },
    { area: 'outdoor-smoking', start: at(19), end: at(21) },
    { area: 'indoor', start: at(19), end: at(21) },
    { area: null, start: at(19), end: at(21) },
  ]

  it('allows a change no upcoming booking needs', () => {
    expect(
      seatingAreaShrinkProblem({
        before,
        after: [
          { setting: 'indoor', tables: 1 },
          { setting: 'outdoor', smoking: true, tables: 2 },
        ],
        bookings,
      }),
    ).toBeNull()
    expect(seatingAreaShrinkProblem({ before, after: [], bookings: [] })).toBeNull()
  })

  it('refuses removing an area with an upcoming booking', () => {
    const problem = seatingAreaShrinkProblem({
      before,
      after: [{ setting: 'indoor', tables: 5 }],
      bookings,
    })
    expect(problem).toMatch(/Outdoor, smoking/)
    expect(problem).toMatch(/upcoming bookings/)
  })

  it('refuses fewer tables than the bookings already held at one time', () => {
    const problem = seatingAreaShrinkProblem({
      before,
      after: [
        { setting: 'indoor', tables: 5 },
        { setting: 'outdoor', smoking: true, tables: 1 },
      ],
      bookings,
    })
    expect(problem).toMatch(/at least 2 tables/)
  })

  it('treats moving an area to smoking as removing the old one', () => {
    const problem = seatingAreaShrinkProblem({
      before,
      after: [
        { setting: 'indoor', smoking: true, tables: 5 },
        { setting: 'outdoor', smoking: true, tables: 3 },
      ],
      bookings,
    })
    expect(problem).toMatch(/Indoor/)
  })
})

/**
 * The rule the database trigger applies (apps/web/src/migrations-sql/
 * seating-capacity-trigger.sql), as a pure function. Kept in step with the SQL
 * by hand: every branch of the trigger has a row here.
 */
describe('areaCapacityVerdict (the trigger rule)', () => {
  const row = (over: Partial<CapacityRow> = {}): CapacityRow => ({
    id: 0,
    area: null,
    status: 'confirmed',
    roomCount: 0,
    start: at(19),
    end: at(21),
    ...over,
  })
  const listing = (
    areas: { setting: string; smoking?: boolean; tables: number }[],
    capacity = 2,
  ) => ({
    capacity,
    areas,
  })

  it('ignores a booking that does not occupy, and a room booking', () => {
    expect(
      areaCapacityVerdict(listing([], 1), row({ status: 'cancelled' }), [row({ id: 1 })]),
    ).toBe('ok')
    expect(areaCapacityVerdict(listing([], 1), row({ roomCount: 2 }), [row({ id: 1 })])).toBe('ok')
  })

  it('a listing without areas: exactly today, every non-room booking against capacity', () => {
    const others = [row({ id: 1 }), row({ id: 2, area: 'indoor' })]
    expect(areaCapacityVerdict(listing([], 2), row(), others)).toBe('full')
    expect(areaCapacityVerdict(listing([], 3), row(), others)).toBe('ok')
    // Half-open: one ending when this starts is no conflict.
    expect(
      areaCapacityVerdict(listing([], 1), row(), [row({ id: 1, start: at(17), end: at(19) })]),
    ).toBe('ok')
    // Not counting itself on an update.
    expect(areaCapacityVerdict(listing([], 1), row({ id: 1 }), [row({ id: 1 })])).toBe('ok')
  })

  it('an area booking counts only bookings of the same area, against its tables', () => {
    const l = listing(
      [
        { setting: 'indoor', tables: 2 },
        { setting: 'outdoor', tables: 1 },
      ],
      1,
    )
    const others = [row({ id: 1, area: 'indoor' }), row({ id: 2, area: 'outdoor' }), row({ id: 3 })]
    expect(areaCapacityVerdict(l, row({ area: 'indoor' }), others)).toBe('ok')
    expect(areaCapacityVerdict(l, row({ area: 'outdoor' }), others)).toBe('full')
    expect(
      areaCapacityVerdict(l, row({ area: 'indoor' }), [...others, row({ id: 4, area: 'indoor' })]),
    ).toBe('full')
  })

  it('refuses an area the listing does not have', () => {
    expect(
      areaCapacityVerdict(
        listing([{ setting: 'indoor', tables: 5 }]),
        row({ area: 'outdoor' }),
        [],
      ),
    ).toBe('no-area')
    expect(areaCapacityVerdict(listing([]), row({ area: 'indoor' }), [])).toBe('no-area')
  })

  it('an old booking without an area at a listing with areas counts only against other such bookings', () => {
    const l = listing([{ setting: 'indoor', tables: 5 }], 1)
    expect(areaCapacityVerdict(l, row(), [row({ id: 1, area: 'indoor' })])).toBe('ok')
    expect(areaCapacityVerdict(l, row(), [row({ id: 1 })])).toBe('full')
  })
})

describe('the partner allow-list and the booking request', () => {
  it('lets a partner edit their seating areas', () => {
    expect(PARTNER_EDITABLE_FIELDS).toContain('seatingAreas')
  })

  const request = {
    business: 7,
    start: '2026-12-03T17:00:00.000Z',
    end: '2026-12-03T19:00:00.000Z',
    partySize: 2,
  }

  it('accepts one of the four area keys, and nothing else', () => {
    for (const area of SEATING_AREA_KEYS) {
      expect(bookingRequestSchema.safeParse({ ...request, area }).success, area).toBe(true)
      expect(availabilityQuerySchema.safeParse({ ...request, area }).success, area).toBe(true)
    }
    expect(bookingRequestSchema.safeParse(request).success).toBe(true)
    expect(bookingRequestSchema.safeParse({ ...request, area: 'rooftop' }).success).toBe(false)
    expect(availabilityQuerySchema.safeParse({ ...request, area: 'rooftop' }).success).toBe(false)
  })
})

describe('areaCapacityVerdict at a guest house (Task 6 ruling, kept by the trigger)', () => {
  const row = (id: number): CapacityRow => ({
    id,
    area: null,
    status: 'confirmed',
    roomCount: 0,
    start: at(19),
    end: at(21),
  })

  it('is capacity 1 whatever the stored capacity says', () => {
    expect(areaCapacityVerdict({ capacity: 4, areas: [], getaway: true }, row(0), [row(1)])).toBe(
      'full',
    )
    expect(areaCapacityVerdict({ capacity: 4, areas: [] }, row(0), [row(1)])).toBe('ok')
  })
})
