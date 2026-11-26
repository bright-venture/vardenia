import { isWholePropertyStay } from './taxonomy'
import type { BookingStatus } from './booking'

/**
 * Restaurant seating areas (Task 8, 20 November 2026).
 *
 * A restaurant may split its tables into areas: indoor or outdoor, smoking or
 * not. Each area has its own number of tables, which is how many bookings may
 * overlap in that area. The guest picks an area, and the booking is counted
 * only against bookings of the same area.
 *
 *  - The area key is derived from the row: `indoor`, `indoor-smoking`,
 *    `outdoor`, `outdoor-smoking`. One row per key per listing.
 *  - A listing without areas books exactly as before: one capacity
 *    (`booking.capacity`) for every non-room booking.
 *  - A listing with areas: a new booking must name one of its areas.
 *    Bookings made before the listing had areas carry no area; they are not
 *    counted against any area, only against each other and the listing's
 *    capacity (the same rule in the database trigger; see areaCapacityVerdict).
 *
 * The guarantee is the database trigger (apps/web/src/migrations-sql/
 * seating-capacity-trigger.sql, installed by the Task 11 migration);
 * areaCapacityVerdict is the same rule as a pure function, tested here.
 */

export const SEATING_SETTINGS = ['indoor', 'outdoor'] as const
export type SeatingSetting = (typeof SEATING_SETTINGS)[number]

export const SEATING_AREA_KEYS = ['indoor', 'indoor-smoking', 'outdoor', 'outdoor-smoking'] as const
export type SeatingAreaKey = (typeof SEATING_AREA_KEYS)[number]

export const MAX_SEATING_AREAS = 8

/** The English name of an area, for messages and the admin. */
export const SEATING_AREA_NAMES: Record<SeatingAreaKey, string> = {
  indoor: 'Indoor',
  'indoor-smoking': 'Indoor, smoking',
  outdoor: 'Outdoor',
  'outdoor-smoking': 'Outdoor, smoking',
}

/** A row as stored on the listing (`seatingAreas`). Loose: read from the CMS. */
export interface SeatingAreaRow {
  id?: string | null
  setting?: string | null
  smoking?: boolean | null
  tables?: number | null
  label?: string | null
}

export interface SeatingArea {
  key: SeatingAreaKey
  setting: SeatingSetting
  smoking: boolean
  tables: number
  label: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The key of a row, or null when its setting is not one on offer. */
export function seatingAreaKey(row: SeatingAreaRow | null | undefined): SeatingAreaKey | null {
  if (!row || !(SEATING_SETTINGS as readonly unknown[]).includes(row.setting)) return null
  return `${row.setting}${row.smoking === true ? '-smoking' : ''}` as SeatingAreaKey
}

export function isSeatingAreaKey(value: unknown): value is SeatingAreaKey {
  return (SEATING_AREA_KEYS as readonly unknown[]).includes(value)
}

/**
 * Restaurants only. A guest house is booked whole (even one also filed as a
 * restaurant), so it never has areas. A listing that is both a hotel and a
 * restaurant may: its table bookings use them, its room bookings use rooms.
 */
export function canHaveSeatingAreas(
  subcategories: readonly (string | null | undefined)[],
): boolean {
  return subcategories.includes('restaurants') && !isWholePropertyStay(subcategories)
}

const validTables = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1

/**
 * Why these areas cannot be saved on this listing, or null. Empty areas are
 * always fine. Checked on every save by apps/web hooks/guardKindFields, since
 * the admin hides the field on other kinds of place (and Payload then skips
 * its validation).
 */
export function seatingAreasProblem({
  subcategories,
  areas,
}: {
  subcategories: readonly (string | null | undefined)[]
  areas: readonly unknown[] | null | undefined
}): string | null {
  const rows = Array.isArray(areas) ? areas : []
  if (rows.length === 0) return null
  if (!canHaveSeatingAreas(subcategories)) return 'Seating areas are only for restaurants.'
  if (rows.length > MAX_SEATING_AREAS) {
    return `A restaurant has at most ${MAX_SEATING_AREAS} seating areas.`
  }
  const seen = new Set<SeatingAreaKey>()
  for (const raw of rows) {
    const row = (isRecord(raw) ? raw : {}) as SeatingAreaRow
    const key = seatingAreaKey(row)
    if (!key) return 'Choose indoor or outdoor for each seating area.'
    if (!validTables(row.tables)) {
      return `Give the ${SEATING_AREA_NAMES[key]} area a number of tables: a whole number, 1 or more.`
    }
    if (seen.has(key)) {
      return `Each seating area can be listed once, and "${SEATING_AREA_NAMES[key]}" is listed twice. Put all its tables in one row.`
    }
    seen.add(key)
  }
  return null
}

/**
 * The listing's areas, valid rows only, in their order. None for a listing
 * that cannot have areas, whatever is stored. A duplicate key (refused on save)
 * keeps the smaller number of tables, the same as the database trigger.
 */
export function seatingAreasOf(listing: {
  subcategories?: readonly (string | null | undefined)[] | null
  seatingAreas?: readonly unknown[] | null
}): SeatingArea[] {
  if (!canHaveSeatingAreas(listing.subcategories ?? [])) return []
  return areasFromRows(listing.seatingAreas)
}

function areasFromRows(rows: readonly unknown[] | null | undefined): SeatingArea[] {
  const out: SeatingArea[] = []
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = (isRecord(raw) ? raw : {}) as SeatingAreaRow
    const key = seatingAreaKey(row)
    if (!key || !validTables(row.tables)) continue
    const existing = out.find((area) => area.key === key)
    if (existing) {
      existing.tables = Math.min(existing.tables, row.tables)
      continue
    }
    out.push({
      key,
      setting: row.setting as SeatingSetting,
      smoking: row.smoking === true,
      tables: row.tables,
      label: typeof row.label === 'string' && row.label.trim() ? row.label.trim() : null,
    })
  }
  return out
}

export type SeatingAreaRefusal = 'area-required' | 'area-unknown'

/**
 * The area a new booking is counted in. No areas defined: none, and an area
 * sent anyway is dropped (the listing books as it always did). Areas defined:
 * one of them is required.
 */
export function resolveSeatingArea(
  areas: readonly SeatingArea[],
  requested: string | null | undefined,
): { ok: true; area: SeatingArea | null } | { ok: false; reason: SeatingAreaRefusal } {
  if (areas.length === 0) return { ok: true, area: null }
  if (!requested) return { ok: false, reason: 'area-required' }
  const area = areas.find((candidate) => candidate.key === requested)
  return area ? { ok: true, area } : { ok: false, reason: 'area-unknown' }
}

interface Span {
  start: Date
  end: Date
}

/** The most intervals held at one instant. Half-open: [start, end). */
export function maxConcurrent(spans: readonly Span[]): number {
  const events: [number, number][] = []
  for (const span of spans) {
    const start = span.start.getTime()
    const end = span.end.getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    events.push([start, 1], [end, -1])
  }
  // Ends before starts at the same instant: back-to-back is not an overlap.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let now = 0
  let most = 0
  for (const [, delta] of events) {
    now += delta
    most = Math.max(most, now)
  }
  return most
}

/**
 * Why this change to a listing's areas would strand bookings, or null.
 *
 * `bookings` are the listing's upcoming occupying bookings (pending or
 * confirmed, ending after now). An area that loses its row while one of them
 * names it is refused; so is fewer tables than the most of them held at one
 * time. Changing a row from non-smoking to smoking changes its key, so it is
 * removing one area and adding another.
 */
export function seatingAreaShrinkProblem({
  before,
  after,
  bookings,
}: {
  before: readonly unknown[] | null | undefined
  after: readonly unknown[] | null | undefined
  bookings: readonly { area?: string | null; start: Date; end: Date }[]
}): string | null {
  const now = areasFromRows(after)
  for (const old of areasFromRows(before)) {
    const held = bookings.filter((booking) => booking.area === old.key)
    if (held.length === 0) continue
    const kept = now.find((area) => area.key === old.key)
    const name = SEATING_AREA_NAMES[old.key]
    if (!kept) {
      return `The ${name} area has upcoming bookings, so it cannot be removed or changed. Cancel or move those bookings first.`
    }
    const most = maxConcurrent(held)
    if (kept.tables < most) {
      return `The ${name} area has ${most} upcoming bookings at the same time, so it needs at least ${most} tables until they are over.`
    }
  }
  return null
}

/** A booking row, as the database trigger sees it. */
export interface CapacityRow {
  id: number | string
  area: string | null
  status: BookingStatus
  roomCount: number
  start: Date
  end: Date
}

/**
 * The database trigger's rule, as a pure function: whether `row` may be
 * written next to `others` (every other booking of the listing).
 *
 *  - Not occupying (cancelled, completed, no-show) or a room booking: not
 *    counted here ('ok'; rooms have their own trigger).
 *  - No area: against `capacity` (null means 1; always 1 for a getaway). At a listing without areas,
 *    every other non-room occupying booking counts (exactly the rule before
 *    Task 8); at a listing with areas, only the others without an area.
 *  - An area: 'no-area' when the listing has no such area; otherwise against
 *    that area's tables, counting only occupying non-room bookings of the same
 *    area.
 *
 * Overlap is half-open, and a row never conflicts with itself.
 */
export function areaCapacityVerdict(
  listing: {
    capacity?: number | null
    areas: readonly unknown[]
    /** Filed under 'getaways': one property, capacity 1 (Task 6 ruling). */
    getaway?: boolean
  },
  row: CapacityRow,
  others: readonly CapacityRow[],
): 'ok' | 'full' | 'no-area' {
  if (row.status !== 'pending' && row.status !== 'confirmed') return 'ok'
  if (row.roomCount > 0) return 'ok'

  const areas = areasFromRows(listing.areas)
  let allowed: number
  let counts: (other: CapacityRow) => boolean
  if (row.area === null) {
    allowed =
      listing.getaway === true
        ? 1
        : typeof listing.capacity === 'number' && Number.isFinite(listing.capacity)
          ? listing.capacity
          : 1
    counts = (other) => areas.length === 0 || other.area === null
  } else {
    const area = areas.find((candidate) => candidate.key === row.area)
    if (!area) return 'no-area'
    allowed = area.tables
    counts = (other) => other.area === row.area
  }

  const taken = others.filter(
    (other) =>
      String(other.id) !== String(row.id) &&
      (other.status === 'pending' || other.status === 'confirmed') &&
      other.roomCount === 0 &&
      counts(other) &&
      other.start.getTime() < row.end.getTime() &&
      other.end.getTime() > row.start.getTime(),
  ).length
  return taken >= allowed ? 'full' : 'ok'
}
