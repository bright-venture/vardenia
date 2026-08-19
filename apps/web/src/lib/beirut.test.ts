import { describe, expect, it } from 'vitest'
import { addDays, beirutDate, beirutInstant, beirutOffset, formatBeirut } from './beirut'

/**
 * The conversion the booking form depends on for correctness.
 *
 * Everything here is a real instant checked against what Beirut's clock actually
 * read at it, not against arithmetic repeated from the implementation. The two
 * offsets are EET (+2) in winter and EEST (+3) in summer, and Lebanon still
 * changes between them - at midnight local on the last Sunday, which is not the
 * same moment as the EU's 01:00 UTC and is the sort of detail that makes
 * hand-rolled offset maths wrong twice a year.
 */

describe('beirutOffset', () => {
  it('is two hours in winter', () => {
    expect(beirutOffset(new Date('2026-01-15T12:00:00Z'))).toBe(2 * 3_600_000)
  })

  it('is three hours in summer', () => {
    expect(beirutOffset(new Date('2026-09-01T12:00:00Z'))).toBe(3 * 3_600_000)
  })
})

describe('beirutInstant', () => {
  it('reads a summer evening as EEST, not as the browser thinks', () => {
    // 20:00 in Beirut on 1 September is 17:00 UTC.
    expect(beirutInstant('2026-09-01', '20:00')?.toISOString()).toBe('2026-09-01T17:00:00.000Z')
  })

  it('reads a winter evening as EET', () => {
    expect(beirutInstant('2026-01-15', '20:00')?.toISOString()).toBe('2026-01-15T18:00:00.000Z')
  })

  it('handles midnight', () => {
    expect(beirutInstant('2026-09-01', '00:00')?.toISOString()).toBe('2026-08-31T21:00:00.000Z')
  })

  /**
   * The hour that does not exist. Clocks go from 00:00 to 01:00 on 29 March, so
   * nothing in the browser stops somebody typing 00:30. Landing on 01:30 - the
   * next instant that does exist - is the same thing every calendar does, and
   * the important part is that it resolves rather than throwing or producing an
   * Invalid Date that reaches the endpoint as "those dates do not make sense".
   */
  it('resolves a time inside the spring-forward gap to the instant after it', () => {
    const instant = beirutInstant('2026-03-29', '00:30')
    expect(instant?.toISOString()).toBe('2026-03-28T22:30:00.000Z')
  })

  it('is exact on the far side of the spring transition', () => {
    expect(beirutInstant('2026-03-29', '03:00')?.toISOString()).toBe('2026-03-29T00:00:00.000Z')
  })

  it('is exact after the autumn transition', () => {
    // The clocks went back at 00:00 local on 25 October, so 20:00 that evening
    // is EET and 18:00 UTC.
    expect(beirutInstant('2026-10-25', '20:00')?.toISOString()).toBe('2026-10-25T18:00:00.000Z')
  })

  it.each([
    ['', '20:00'],
    ['2026-09-01', ''],
    ['01/09/2026', '20:00'],
    ['2026-09-01', '25:00'],
    ['2026-09-01', '20:99'],
    ['2026-13-01', '20:00'],
    ['2026-09-00', '20:00'],
  ])('returns null for (%s, %s) rather than guessing', (date, time) => {
    expect(beirutInstant(date, time)).toBeNull()
  })

  it('accepts a single-digit hour, which is what some browsers send', () => {
    expect(beirutInstant('2026-09-01', '9:30')?.toISOString()).toBe('2026-09-01T06:30:00.000Z')
  })
})

describe('beirutDate', () => {
  it('is the Beirut day, not the UTC one', () => {
    // 22:00 UTC on 31 August is already 01:00 on 1 September in Beirut.
    expect(beirutDate(new Date('2026-08-31T22:00:00Z'))).toBe('2026-09-01')
  })

  it('pads to a form a date input accepts', () => {
    expect(beirutDate(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05')
  })
})

describe('addDays', () => {
  it('crosses a month', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('crosses a year', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('goes backwards', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  /**
   * The reason this is calendar arithmetic and not milliseconds. Adding
   * 86,400,000ms across the spring transition lands at 23:00 the same evening,
   * so "tomorrow" would still be today.
   */
  it('is unaffected by the clocks changing', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
  })

  it('returns the input unchanged when it cannot parse it', () => {
    expect(addDays('not-a-date', 3)).toBe('not-a-date')
  })
})

describe('formatBeirut', () => {
  it('shows the Beirut clock rather than the visitor one', () => {
    const text = formatBeirut(new Date('2026-09-01T17:00:00Z'), 'en')
    expect(text).toContain('20:00')
    expect(text).toContain('Tuesday')
  })

  it('writes Arabic in Arabic', () => {
    const text = formatBeirut(new Date('2026-09-01T17:00:00Z'), 'ar')
    // Not asserting the exact wording, which is the runtime's to choose - only
    // that it is not the English one.
    expect(text).not.toContain('Tuesday')
    expect(text.length).toBeGreaterThan(0)
  })
})
