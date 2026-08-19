import { describe, expect, it } from 'vitest'
import { partitionBookings } from './session'

/**
 * Which heading a booking appears under on somebody's account page.
 *
 * Pure, and taking an explicit clock, for two reasons that arrived together.
 * The rule below is easy to get subtly wrong and impossible to notice, and
 * `Date.now()` in a component body is what `react-hooks/purity` rejects - the
 * finding that failed the Netlify build. Moving the clock into an argument
 * fixed both.
 */

const at = (iso: string) => new Date(iso).getTime()
const booking = (end: string, id = end) => ({ id, end })

describe('partitionBookings', () => {
  const now = at('2026-08-19T18:00:00Z')

  it('files a finished booking under past', () => {
    const { upcoming, past } = partitionBookings([booking('2026-08-19T17:00:00Z')], now)
    expect(upcoming).toHaveLength(0)
    expect(past).toHaveLength(1)
  })

  it('files a future booking under upcoming', () => {
    const { upcoming, past } = partitionBookings([booking('2026-08-20T17:00:00Z')], now)
    expect(upcoming).toHaveLength(1)
    expect(past).toHaveLength(0)
  })

  /**
   * The whole reason the split is on the end rather than the start. A table
   * booked for 20:00 to 22:00, seen at 21:00, is the single most relevant thing
   * on the page - and splitting on the start would have filed it under Past.
   */
  it('keeps a booking that is happening right now under upcoming', () => {
    const inProgress = { id: 'now', end: '2026-08-19T20:00:00Z', start: '2026-08-19T17:00:00Z' }
    const { upcoming } = partitionBookings([inProgress], now)
    expect(upcoming).toHaveLength(1)
  })

  it('treats a booking ending exactly now as still upcoming', () => {
    const { upcoming } = partitionBookings([booking('2026-08-19T18:00:00Z')], now)
    expect(upcoming).toHaveLength(1)
  })

  /**
   * A row with an unreadable date is shown rather than dropped. A booking that
   * silently disappears from somebody's account is worse than one under the
   * wrong heading - they would have no way to know it was ever there.
   */
  it('shows a booking with an unparseable date rather than losing it', () => {
    const { upcoming, past } = partitionBookings([booking('not-a-date')], now)
    expect(upcoming).toHaveLength(1)
    expect(past).toHaveLength(0)
  })

  it('keeps every booking somewhere', () => {
    const all = [
      booking('2026-08-01T12:00:00Z'),
      booking('2026-08-19T17:59:59Z'),
      booking('2026-08-19T18:00:01Z'),
      booking('2026-12-25T12:00:00Z'),
      booking('rubbish'),
    ]
    const { upcoming, past } = partitionBookings(all, now)
    expect(upcoming.length + past.length).toBe(all.length)
  })

  it('handles an empty list', () => {
    expect(partitionBookings([], now)).toEqual({ upcoming: [], past: [] })
  })
})
