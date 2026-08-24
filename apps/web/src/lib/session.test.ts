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

/**
 * A settled booking is not upcoming, whatever the calendar says.
 *
 * The bug: this split on the end date alone, so a booking marked COMPLETED,
 * CANCELLED or NO-SHOW appeared under "Upcoming" until its date passed. A
 * reader saw a card reading COMPLETED filed under Upcoming on the same screen.
 *
 * Both halves are real. An owner can mark a table done before the slot ends,
 * and a cancellation weeks ahead is the common case rather than the odd one.
 */
describe('partitionBookings and terminal statuses', () => {
  const future = new Date(Date.now() + 7 * 24 * 3600_000).toISOString()
  const past = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()

  it('files a completed booking under past even when its date is ahead', () => {
    const { upcoming, past: done } = partitionBookings([
      { end: future, status: 'completed' },
    ])
    expect(upcoming).toHaveLength(0)
    expect(done).toHaveLength(1)
  })

  it('files a cancellation under past even when its date is ahead', () => {
    const { upcoming, past: done } = partitionBookings([
      { end: future, status: 'cancelled' },
    ])
    expect(upcoming).toHaveLength(0)
    expect(done).toHaveLength(1)
  })

  it('files a no-show under past even when its date is ahead', () => {
    const { upcoming } = partitionBookings([{ end: future, status: 'no-show' }])
    expect(upcoming).toHaveLength(0)
  })

  it('still shows a live booking as upcoming', () => {
    for (const status of ['pending', 'confirmed']) {
      const { upcoming } = partitionBookings([{ end: future, status }])
      expect(upcoming, `${status} should be upcoming`).toHaveLength(1)
    }
  })

  it('still files a finished date under past', () => {
    const { past: done } = partitionBookings([{ end: past, status: 'confirmed' }])
    expect(done).toHaveLength(1)
  })

  it('tolerates a booking with no status at all', () => {
    const { upcoming } = partitionBookings([{ end: future }])
    expect(upcoming).toHaveLength(1)
  })
})
