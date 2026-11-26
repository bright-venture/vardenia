import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translateInsertError } from '../lib/booking-service'
import { unavailableMessage } from '../lib/availability'

/**
 * The Task 8 trigger SQL, for Task 11 to install. Its rule is tested as a pure
 * function in core/seating (areaCapacityVerdict); this keeps the SQL itself in
 * step with what the application relies on.
 */
const SQL = readFileSync(new URL('./seating-capacity-trigger.sql', import.meta.url), 'utf8')

describe('the seating capacity trigger SQL', () => {
  it('takes the same per-listing lock as before, and as lib/booking-lock', () => {
    expect(SQL).toContain(
      "pg_advisory_xact_lock(hashtext('vardenia.booking:' || NEW.business_id::text))",
    )
  })

  it('keeps the old rule for a listing without areas, and skips room bookings', () => {
    expect(SQL).toContain('(NOT has_areas OR x.area IS NULL)')
    expect(SQL).toContain('COALESCE(NEW.room_count, 0) > 0')
    expect(SQL).toContain('COALESCE(b.booking_capacity, 1)')
  })

  it('counts an area booking against its tables, same area only, half-open', () => {
    expect(SQL).toContain('min(s.tables)')
    expect(SQL).toContain("CASE WHEN s.smoking THEN '-smoking' ELSE '' END")
    expect(SQL).toContain('AND x.area = NEW.area')
    expect(SQL.match(/x\."start" < NEW\."end"/g)?.length).toBe(2)
    expect(SQL.match(/x\."end" > NEW\."start"/g)?.length).toBe(2)
  })

  it('fires when a booking moves to another area', () => {
    expect(SQL).toMatch(/UPDATE OF "start", "end", status, business_id, area\b/)
  })

  it('refuses in words the booking service translates', () => {
    for (const [message, reason] of [
      ['This place is fully booked at that time.', 'at-capacity'],
      ['This seating area is not offered here.', 'area-unknown'],
    ] as const) {
      expect(SQL).toContain(`'${message}'`)
      expect(translateInsertError(new Error(message), 'ar')).toEqual({
        ok: false,
        code: 'unavailable',
        message: unavailableMessage(reason, 'ar'),
      })
    }
  })

  /*
   * Task 6 ruling (review of Task 8): a guest house is one property, so the
   * trigger treats any listing filed under 'getaways' as capacity 1 whatever
   * booking_capacity says. Real names: businesses_subcategories(parent_id,
   * value), from migrations/20260813_123246_baseline.
   */
  it('treats a getaway as capacity 1 in the no-area branch', () => {
    const noArea = SQL.slice(SQL.indexOf('IF NEW.area IS NULL THEN'), SQL.indexOf('  ELSE\n'))
    expect(noArea).toMatch(
      /IF EXISTS \(\s*SELECT 1 FROM "payload"\."businesses_subcategories" g\s+WHERE g\.parent_id = NEW\.business_id\s+AND g\.value::text = 'getaways'\s*\) THEN\s+allowed := 1;\s+END IF;/,
    )
    // After the stored capacity is read, so it overrides it.
    expect(noArea.indexOf("'getaways'")).toBeGreaterThan(
      noArea.indexOf('COALESCE(b.booking_capacity, 1)'),
    )
  })

  it('never rounds a fractional number of tables up', () => {
    expect(SQL).toContain('floor(min(s.tables))::integer')
    expect(SQL).not.toMatch(/SELECT min\(s\.tables\)::integer/)
  })
})
