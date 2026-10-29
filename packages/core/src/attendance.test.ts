import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_START,
  amountsDisagree,
  attendanceMismatch,
  canGuestAnswer,
  canSendReceipt,
  shouldAskGuest,
} from './attendance'
import { countsAsCompleted } from './booking-fees'
import { buildPassport, stampStateOf } from './passport'

/**
 * The guest is asked whether they came, and their answer is compared with the
 * venue's. Billing and the passport follow the team's decision where the two
 * disagree.
 */

const NOW = new Date('2026-12-20T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000)
const daysAgo = (d: number) => hoursAgo(d * 24)

describe('asking the guest', () => {
  it('asks a couple of hours after a visit, once', () => {
    expect(shouldAskGuest({ status: 'confirmed', end: hoursAgo(3) }, NOW)).toBe(true)
    expect(shouldAskGuest({ status: 'confirmed', end: hoursAgo(1) }, NOW)).toBe(false)
    expect(
      shouldAskGuest({ status: 'confirmed', end: hoursAgo(3), askedAt: hoursAgo(1) }, NOW),
    ).toBe(false)
  })

  it('asks about no-shows too, since that is where the leak is', () => {
    expect(shouldAskGuest({ status: 'no-show', end: hoursAgo(3) }, NOW)).toBe(true)
  })

  it('never asks about cancelled or pending bookings, old visits or ones before launch', () => {
    expect(shouldAskGuest({ status: 'cancelled', end: hoursAgo(3) }, NOW)).toBe(false)
    expect(shouldAskGuest({ status: 'pending', end: hoursAgo(3) }, NOW)).toBe(false)
    expect(shouldAskGuest({ status: 'confirmed', end: daysAgo(8) }, NOW)).toBe(false)
    expect(
      shouldAskGuest(
        { status: 'confirmed', end: new Date(ATTENDANCE_START.getTime() - 3_600_000) },
        new Date(ATTENDANCE_START.getTime() + 3 * 3_600_000),
      ),
    ).toBe(false)
  })

  it('takes one answer, within a month of the visit', () => {
    expect(canGuestAnswer({ status: 'completed', end: daysAgo(5) }, NOW)).toBe(true)
    expect(canGuestAnswer({ status: 'completed', end: daysAgo(5), guestAnswer: 'came' }, NOW)).toBe(
      false,
    )
    expect(canGuestAnswer({ status: 'completed', end: daysAgo(31) }, NOW)).toBe(false)
    expect(canGuestAnswer({ status: 'confirmed', end: hoursAgo(-2) }, NOW)).toBe(false)
  })
})

describe('when the guest and the venue disagree', () => {
  it('flags a real visit marked a no-show', () => {
    expect(attendanceMismatch({ status: 'no-show', end: daysAgo(1), guestAnswer: 'came' })).toBe(
      'guest-says-came',
    )
    expect(attendanceMismatch({ status: 'cancelled', end: daysAgo(1), guestAnswer: 'came' })).toBe(
      'guest-says-came',
    )
  })

  it('flags a visit billed that the guest says never happened', () => {
    expect(
      attendanceMismatch({ status: 'completed', end: daysAgo(1), guestAnswer: 'did-not-come' }),
    ).toBe('guest-says-absent')
  })

  it('is settled once the team decides', () => {
    expect(
      attendanceMismatch({
        status: 'no-show',
        end: daysAgo(1),
        guestAnswer: 'came',
        verdict: 'venue',
      }),
    ).toBeNull()
  })

  it('flags a guest and a venue far apart on what was spent', () => {
    const facts = { status: 'completed' as const, end: daysAgo(1), guestAnswer: 'came' as const }
    expect(attendanceMismatch({ ...facts, amount: 40, guestAmount: 120 })).toBe('amount-differs')
    expect(attendanceMismatch({ ...facts, amount: 100, guestAmount: 90 })).toBeNull()
    expect(
      attendanceMismatch({ ...facts, amount: 40, guestAmount: 120, verdict: 'venue' }),
    ).toBeNull()
  })

  it('leaves a rough guess alone, and needs both amounts to compare', () => {
    expect(amountsDisagree(100, 80)).toBe(false)
    expect(amountsDisagree(100, 70)).toBe(true)
    expect(amountsDisagree(100, null)).toBe(false)
  })
})

describe('billing follows the team decision', () => {
  it('bills a no-show the team found the guest came to', () => {
    expect(
      countsAsCompleted(
        { status: 'no-show', end: daysAgo(10), guestAnswer: 'came', verdict: 'guest' },
        NOW,
      ),
    ).toBe(true)
  })

  it('does not bill a completed visit the team found never happened', () => {
    expect(
      countsAsCompleted(
        { status: 'completed', end: daysAgo(10), guestAnswer: 'did-not-come', verdict: 'guest' },
        NOW,
      ),
    ).toBe(false)
  })

  it('keeps the venue rule where the team sided with the venue, or nobody disputed', () => {
    expect(
      countsAsCompleted(
        { status: 'no-show', end: daysAgo(10), guestAnswer: 'came', verdict: 'venue' },
        NOW,
      ),
    ).toBe(false)
    expect(countsAsCompleted({ status: 'completed', end: daysAgo(10) }, NOW)).toBe(true)
  })
})

describe('the passport after launch', () => {
  it('asks the guest before stamping', () => {
    expect(stampStateOf({ status: 'completed', end: daysAgo(2) }, NOW)).toBe('confirm')
    expect(stampStateOf({ status: 'completed', end: daysAgo(2), guestAnswer: 'came' }, NOW)).toBe(
      'stamped',
    )
    expect(stampStateOf({ status: 'confirmed', end: daysAgo(2), guestAnswer: 'came' }, NOW)).toBe(
      'stamped',
    )
  })

  it('holds a disputed visit for review, then follows the team', () => {
    expect(stampStateOf({ status: 'no-show', end: daysAgo(2), guestAnswer: 'came' }, NOW)).toBe(
      'review',
    )
    expect(
      stampStateOf(
        { status: 'no-show', end: daysAgo(2), guestAnswer: 'came', verdict: 'guest' },
        NOW,
      ),
    ).toBe('stamped')
    expect(
      stampStateOf(
        { status: 'no-show', end: daysAgo(2), guestAnswer: 'came', verdict: 'venue' },
        NOW,
      ),
    ).toBeNull()
  })

  it('gives nothing to a guest who says they did not go, or who never answered in time', () => {
    expect(
      stampStateOf({ status: 'completed', end: daysAgo(2), guestAnswer: 'did-not-come' }, NOW),
    ).toBeNull()
    expect(stampStateOf({ status: 'completed', end: daysAgo(40) }, NOW)).toBeNull()
  })

  it('lists the visit to confirm first, with the booking to answer about', () => {
    const passport = buildPassport(
      [
        { businessId: '1', bookingId: '11', status: 'completed', end: daysAgo(2) },
        {
          businessId: '2',
          bookingId: '22',
          status: 'no-show',
          end: daysAgo(3),
          guestAnswer: 'came',
        },
      ],
      NOW,
    )
    expect(passport.stamps).toEqual([])
    expect(passport.pending.map((p) => [p.businessId, p.kind, p.bookingId])).toEqual([
      ['1', 'confirm', '11'],
      ['2', 'review', undefined],
    ])
  })
})

describe('sending a receipt', () => {
  const visit = { status: 'completed' as const, end: daysAgo(2), hasReceipt: false }

  it('is open after the visit, answered or not, until a receipt is in', () => {
    expect(canSendReceipt(visit, NOW)).toBe(true)
    expect(canSendReceipt({ ...visit, guestAnswer: 'came' }, NOW)).toBe(true)
    expect(canSendReceipt({ ...visit, hasReceipt: true }, NOW)).toBe(false)
  })

  it('is closed to a guest who said they did not go, before the visit, and after 30 days', () => {
    expect(canSendReceipt({ ...visit, guestAnswer: 'did-not-come' }, NOW)).toBe(false)
    expect(canSendReceipt({ ...visit, end: daysAgo(-1) }, NOW)).toBe(false)
    expect(canSendReceipt({ ...visit, end: daysAgo(31) }, NOW)).toBe(false)
    expect(canSendReceipt({ ...visit, status: 'cancelled' }, NOW)).toBe(false)
  })
})
