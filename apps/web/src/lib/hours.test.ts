import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDay, isOpenNow, orderedHours, type OpeningHour } from './hours'

/**
 * "Open now" is a claim made to a reader who may be about to drive somewhere.
 * Every assertion here is really about that: getting it wrong sends someone to a
 * closed door, or keeps them away from a place that is serving.
 *
 * Times are written as UTC instants deliberately, so the Beirut conversion is
 * genuinely under test rather than assumed. Beirut is UTC+2 in winter and UTC+3
 * in summer.
 *
 * Reference points, verified against Intl:
 *   2026-01-15T12:00:00Z -> Thursday 14:00 Beirut (winter, UTC+2)
 *   2026-07-15T12:00:00Z -> Wednesday 15:00 Beirut (summer, UTC+3)
 */

const at = (iso: string) => new Date(iso)

/** Thursday 09:00-23:00 in winter. */
const THURSDAY_DAYTIME: OpeningHour[] = [{ day: 'thu', opens: '09:00', closes: '23:00' }]

describe('isOpenNow', () => {
  describe('when we do not know', () => {
    it('returns null for no hours at all', () => {
      expect(isOpenNow(null)).toBeNull()
      expect(isOpenNow(undefined)).toBeNull()
      expect(isOpenNow([])).toBeNull()
    })

    /** Null is not the same as false, and the page renders them differently. */
    it('distinguishes unknown from closed', () => {
      expect(isOpenNow(null)).toBeNull()
      expect(isOpenNow([{ day: 'thu', closed: true }], at('2026-01-15T12:00:00Z'))).toBe(false)
    })

    it('is not fooled by times it cannot parse', () => {
      const junk: OpeningHour[] = [{ day: 'thu', opens: 'morning', closes: 'late' }]
      expect(isOpenNow(junk, at('2026-01-15T12:00:00Z'))).toBe(false)
    })

    it('rejects impossible clock values rather than computing with them', () => {
      const bad: OpeningHour[] = [{ day: 'thu', opens: '25:00', closes: '99:99' }]
      expect(isOpenNow(bad, at('2026-01-15T12:00:00Z'))).toBe(false)
    })
  })

  describe('an ordinary daytime window', () => {
    it('is open in the middle of it', () => {
      // 14:00 Beirut, inside 09:00-23:00.
      expect(isOpenNow(THURSDAY_DAYTIME, at('2026-01-15T12:00:00Z'))).toBe(true)
    })

    it('is closed before opening', () => {
      // 08:00 Beirut.
      expect(isOpenNow(THURSDAY_DAYTIME, at('2026-01-15T06:00:00Z'))).toBe(false)
    })

    it('is open on the opening minute', () => {
      // 09:00 Beirut exactly.
      expect(isOpenNow(THURSDAY_DAYTIME, at('2026-01-15T07:00:00Z'))).toBe(true)
    })

    /** A venue that closes at 23:00 is not open at 23:00. */
    it('is closed on the closing minute', () => {
      expect(isOpenNow(THURSDAY_DAYTIME, at('2026-01-15T21:00:00Z'))).toBe(false)
    })

    it('is closed on a day with no entry', () => {
      // Friday 14:00 Beirut, and only Thursday is recorded.
      expect(isOpenNow(THURSDAY_DAYTIME, at('2026-01-16T12:00:00Z'))).toBe(false)
    })
  })

  /**
   * The case that makes this module non-trivial. A restaurant open 20:00-03:00
   * is open at 01:30, and that 01:30 belongs to the *next* calendar day.
   */
  describe('a window running past midnight', () => {
    const NIGHT: OpeningHour[] = [{ day: 'thu', opens: '20:00', closes: '03:00' }]

    it('is open late on the evening it started', () => {
      // Thursday 22:00 Beirut.
      expect(isOpenNow(NIGHT, at('2026-01-15T20:00:00Z'))).toBe(true)
    })

    it('is still open after midnight, on the following day', () => {
      // Friday 01:30 Beirut - Thursday's session has not ended.
      expect(isOpenNow(NIGHT, at('2026-01-15T23:30:00Z'))).toBe(true)
    })

    it('is closed once that session ends', () => {
      // Friday 04:00 Beirut.
      expect(isOpenNow(NIGHT, at('2026-01-16T02:00:00Z'))).toBe(false)
    })

    it('is closed in the afternoon before it opens', () => {
      // Thursday 15:00 Beirut.
      expect(isOpenNow(NIGHT, at('2026-01-15T13:00:00Z'))).toBe(false)
    })

    it('does not leak a past-midnight session into a day that is marked closed', () => {
      const closedThursday: OpeningHour[] = [{ day: 'thu', closed: true }]
      expect(isOpenNow(closedThursday, at('2026-01-15T23:30:00Z'))).toBe(false)
    })
  })

  /**
   * Lebanon observes daylight saving. If this were evaluated in UTC, every
   * answer would be wrong by two or three hours depending on the season - and
   * wrong in opposite directions, which is the hardest kind of bug to notice.
   */
  describe('daylight saving', () => {
    const NINE_TO_FIVE: OpeningHour[] = [
      { day: 'wed', opens: '09:00', closes: '17:00' },
      { day: 'thu', opens: '09:00', closes: '17:00' },
    ]

    it('reads the same wall-clock time correctly in winter', () => {
      // 08:30 Beirut, still shut. UTC+2.
      expect(isOpenNow(NINE_TO_FIVE, at('2026-01-15T06:30:00Z'))).toBe(false)
      // 09:30 Beirut, open.
      expect(isOpenNow(NINE_TO_FIVE, at('2026-01-15T07:30:00Z'))).toBe(true)
    })

    it('reads the same wall-clock time correctly in summer', () => {
      // 08:30 Beirut, still shut. UTC+3, so an hour earlier in UTC than winter.
      expect(isOpenNow(NINE_TO_FIVE, at('2026-07-15T05:30:00Z'))).toBe(false)
      // 09:30 Beirut, open.
      expect(isOpenNow(NINE_TO_FIVE, at('2026-07-15T06:30:00Z'))).toBe(true)
    })

    /** The visitor's own timezone must never enter into it. */
    it('gives the same answer regardless of where the reader is', () => {
      const instant = at('2026-07-15T06:30:00Z')
      expect(isOpenNow(NINE_TO_FIVE, instant)).toBe(true)
    })
  })
})

/**
 * The environment failing underneath us.
 *
 * A Node built with `small-icu` - what several slim and Alpine images ship -
 * does not carry the Asia/Beirut rules, so the formatter silently produces
 * something unusable. The old code answered "Monday, in UTC" to that and
 * sounded certain. These pin the replacement: say nothing instead.
 */
describe('when the runtime cannot resolve Beirut', () => {
  afterEach(() => vi.restoreAllMocks())

  const withBrokenFormatter = (parts: Intl.DateTimeFormatPart[]) =>
    vi
      .spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
      .mockReturnValue(parts as Intl.DateTimeFormatPart[])

  it('returns unknown when the weekday is unrecognisable', () => {
    withBrokenFormatter([
      { type: 'weekday', value: '???' },
      { type: 'hour', value: '14' },
      { type: 'minute', value: '00' },
    ])
    expect(isOpenNow(THURSDAY_DAYTIME, at('2026-01-15T12:00:00Z'))).toBeNull()
  })

  it('returns unknown when the clock is unusable', () => {
    withBrokenFormatter([
      { type: 'weekday', value: 'Thu' },
      { type: 'hour', value: 'xx' },
      { type: 'minute', value: '00' },
    ])
    expect(isOpenNow(THURSDAY_DAYTIME, at('2026-01-15T12:00:00Z'))).toBeNull()
  })

  it('returns unknown rather than Closed, which would turn readers away', () => {
    withBrokenFormatter([])
    const verdict = isOpenNow(THURSDAY_DAYTIME, at('2026-01-15T12:00:00Z'))
    expect(verdict).toBeNull()
    expect(verdict).not.toBe(false)
  })
})

describe('formatDay', () => {
  it('renders a window', () => {
    expect(formatDay({ day: 'mon', opens: '09:00', closes: '23:00' })).toBe('09:00 - 23:00')
  })

  it('returns null for closed, missing, or unparseable entries', () => {
    expect(formatDay(undefined)).toBeNull()
    expect(formatDay({ day: 'mon', closed: true })).toBeNull()
    expect(formatDay({ day: 'mon', opens: 'nine' })).toBeNull()
  })
})

describe('orderedHours', () => {
  it('puts the week in order no matter how the CMS stored it', () => {
    const scrambled: OpeningHour[] = [
      { day: 'wed', opens: '09:00', closes: '17:00' },
      { day: 'mon', opens: '09:00', closes: '17:00' },
    ]
    expect(orderedHours(scrambled).map((h) => h.day)).toEqual([
      'mon',
      'tue',
      'wed',
      'thu',
      'fri',
      'sat',
      'sun',
    ])
  })

  it('fills missing days as closed rather than dropping them', () => {
    const only = orderedHours([{ day: 'mon', opens: '09:00', closes: '17:00' }])
    expect(only).toHaveLength(7)
    expect(only.find((h) => h.day === 'tue')?.closed).toBe(true)
  })
})
