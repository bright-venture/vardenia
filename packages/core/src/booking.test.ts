import { describe, expect, it } from 'vitest'
import {
  BOOKING_REFERENCE_LENGTH,
  BOOKING_STATUSES,
  availableActions,
  canActorTransition,
  canTransition,
  durationMinutes,
  generateBookingReference,
  isTerminalStatus,
  isUsableInterval,
  normalizeBookingReference,
  occupiesCapacity,
  overlaps,
  type BookingStatus,
} from './booking'
import { CODE_LENGTH } from './qr'

const at = (iso: string) => new Date(iso)

describe('which statuses occupy a place', () => {
  /**
   * The list the capacity check counts. If `pending` ever stopped counting, a
   * restaurant with one table would accept ten requests for Friday night and
   * disappoint nine people - and it would look like a booking system working.
   */
  it('counts pending as well as confirmed', () => {
    expect(occupiesCapacity('pending')).toBe(true)
    expect(occupiesCapacity('confirmed')).toBe(true)
  })

  it('releases the place on cancellation, no-show and completion', () => {
    expect(occupiesCapacity('cancelled')).toBe(false)
    expect(occupiesCapacity('no-show')).toBe(false)
    expect(occupiesCapacity('completed')).toBe(false)
  })

  it('has an answer for every status, so a new one cannot be forgotten', () => {
    for (const status of BOOKING_STATUSES) {
      expect(typeof occupiesCapacity(status)).toBe('boolean')
    }
  })
})

describe('status transitions', () => {
  it('lets a request be confirmed or declined', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true)
    expect(canTransition('pending', 'cancelled')).toBe(true)
  })

  it('lets a confirmed booking be cancelled, completed or marked a no-show', () => {
    expect(canTransition('confirmed', 'cancelled')).toBe(true)
    expect(canTransition('confirmed', 'completed')).toBe(true)
    expect(canTransition('confirmed', 'no-show')).toBe(true)
  })

  /**
   * The important one. Reinstating a cancelled booking by editing its status
   * would take a table without ever passing the capacity check - the check runs
   * on insert, not on every update. Coming back has to mean a new booking.
   */
  it('never allows a terminal status to be reopened', () => {
    for (const from of ['cancelled', 'completed', 'no-show'] as const) {
      for (const to of BOOKING_STATUSES) {
        if (to === from) continue
        expect(canTransition(from, to), `${from} -> ${to} must be refused`).toBe(false)
      }
    }
  })

  it('does not let a request skip straight to completed', () => {
    expect(canTransition('pending', 'completed')).toBe(false)
    expect(canTransition('pending', 'no-show')).toBe(false)
  })

  /** Saving a form without touching the status must not be a transition error. */
  it('treats a status staying put as allowed', () => {
    for (const status of BOOKING_STATUSES) {
      expect(canTransition(status, status)).toBe(true)
    }
  })

  it('identifies the terminal states', () => {
    expect(isTerminalStatus('cancelled')).toBe(true)
    expect(isTerminalStatus('completed')).toBe(true)
    expect(isTerminalStatus('no-show')).toBe(true)
    expect(isTerminalStatus('pending')).toBe(false)
    expect(isTerminalStatus('confirmed')).toBe(false)
  })

  it('refuses a status that is not one of ours without throwing', () => {
    expect(canTransition('pending', 'refunded' as BookingStatus)).toBe(false)
    expect(() => canTransition('nonsense' as BookingStatus, 'confirmed')).not.toThrow()
    expect(canTransition('nonsense' as BookingStatus, 'confirmed')).toBe(false)
  })
})

describe('reference codes', () => {
  it('is a different length from a printed QR code, on purpose', () => {
    // Both get read aloud in the same support calls. One character of difference
    // is what tells you which kind you are holding.
    expect(BOOKING_REFERENCE_LENGTH).not.toBe(CODE_LENGTH)
    expect(generateBookingReference()).toHaveLength(BOOKING_REFERENCE_LENGTH)
  })

  it('never emits the letters that get misread', () => {
    // 500 codes is enough to catch an alphabet that includes I, L, O or U.
    const codes = Array.from({ length: 500 }, () => generateBookingReference())
    for (const code of codes) {
      expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]+$/)
    }
  })

  it('is deterministic when the randomness is', () => {
    const fixed = () => 0
    expect(generateBookingReference(fixed)).toBe('0'.repeat(BOOKING_REFERENCE_LENGTH))
  })

  it('accepts what a customer actually types', () => {
    const code = generateBookingReference()
    expect(normalizeBookingReference(code.toLowerCase())).toBe(code)
    expect(normalizeBookingReference(` ${code} `)).toBe(code)
  })

  it('maps the confusable characters the way the alphabet expects', () => {
    expect(normalizeBookingReference('iL0o1234')).toBe('11001234')
    expect(normalizeBookingReference('u1234567')).toBe('V1234567')
  })

  it('rejects the wrong length rather than padding it', () => {
    expect(normalizeBookingReference('1234567')).toBeNull()
    expect(normalizeBookingReference('123456789')).toBeNull()
    expect(normalizeBookingReference('')).toBeNull()
  })

  /** A seven-character QR code must not normalise into a booking reference. */
  it('rejects a printed QR code', () => {
    expect(normalizeBookingReference('K3M9QP2')).toBeNull()
  })
})

describe('interval overlap', () => {
  const dinner = { start: at('2026-09-01T20:00:00Z'), end: at('2026-09-01T22:00:00Z') }

  /**
   * The off-by-one that breaks booking systems. Half-open intervals mean a table
   * freed at 22:00 can be booked at 22:00. Treat the end as inclusive and every
   * back-to-back sitting reads as a conflict, which halves a restaurant's night.
   */
  it('treats back-to-back bookings as not overlapping', () => {
    const late = { start: at('2026-09-01T22:00:00Z'), end: at('2026-09-02T00:00:00Z') }
    expect(overlaps(dinner, late)).toBe(false)
    expect(overlaps(late, dinner)).toBe(false)
  })

  it('detects a partial overlap from either side', () => {
    const early = { start: at('2026-09-01T19:00:00Z'), end: at('2026-09-01T21:00:00Z') }
    expect(overlaps(dinner, early)).toBe(true)
    expect(overlaps(early, dinner)).toBe(true)
  })

  it('detects containment in both directions', () => {
    const inside = { start: at('2026-09-01T20:30:00Z'), end: at('2026-09-01T21:00:00Z') }
    const around = { start: at('2026-09-01T18:00:00Z'), end: at('2026-09-02T02:00:00Z') }
    expect(overlaps(dinner, inside)).toBe(true)
    expect(overlaps(dinner, around)).toBe(true)
  })

  it('detects an identical interval', () => {
    expect(overlaps(dinner, { ...dinner })).toBe(true)
  })

  it('sees no overlap in intervals that do not touch', () => {
    const lunch = { start: at('2026-09-01T12:00:00Z'), end: at('2026-09-01T14:00:00Z') }
    expect(overlaps(dinner, lunch)).toBe(false)
  })

  /** A hotel stay spans days; the arithmetic must not care. */
  it('works across days', () => {
    const stay = { start: at('2026-09-01T14:00:00Z'), end: at('2026-09-05T11:00:00Z') }
    expect(overlaps(stay, dinner)).toBe(true)
  })
})

describe('duration', () => {
  it('measures in minutes', () => {
    expect(
      durationMinutes({ start: at('2026-09-01T20:00:00Z'), end: at('2026-09-01T22:30:00Z') }),
    ).toBe(150)
  })

  /** A zero-length or reversed interval is not a short booking, it is a broken one. */
  it('returns null rather than zero or a negative', () => {
    const t = at('2026-09-01T20:00:00Z')
    expect(durationMinutes({ start: t, end: t })).toBeNull()
    expect(durationMinutes({ start: at('2026-09-01T22:00:00Z'), end: t })).toBeNull()
  })

  it('returns null for an unparseable date rather than NaN', () => {
    expect(
      durationMinutes({ start: new Date('not a date'), end: at('2026-09-01T22:00:00Z') }),
    ).toBeNull()
    expect(isUsableInterval({ start: new Date('nope'), end: new Date('also nope') })).toBe(false)
  })
})

/**
 * Who may make a transition, as opposed to which transitions exist.
 *
 * Having only the second was a hole found by exercising it: `pending ->
 * confirmed` is legal, a customer may update their own booking, and nothing
 * checked those two facts together. A customer could confirm a booking the
 * business had not accepted - which is the one thing `autoConfirm: false` is
 * supposed to guarantee cannot happen.
 */
describe('canActorTransition', () => {
  it('lets a customer cancel', () => {
    expect(canActorTransition('customer', 'pending', 'cancelled')).toBe(true)
    expect(canActorTransition('customer', 'confirmed', 'cancelled')).toBe(true)
  })

  it('does not let a customer confirm their own booking', () => {
    expect(canActorTransition('customer', 'pending', 'confirmed')).toBe(false)
  })

  it('does not let a customer decide what happened in the building', () => {
    expect(canActorTransition('customer', 'confirmed', 'completed')).toBe(false)
    expect(canActorTransition('customer', 'confirmed', 'no-show')).toBe(false)
  })

  it('lets an owner accept, decline and close out a booking', () => {
    expect(canActorTransition('owner', 'pending', 'confirmed')).toBe(true)
    expect(canActorTransition('owner', 'pending', 'cancelled')).toBe(true)
    expect(canActorTransition('owner', 'confirmed', 'completed')).toBe(true)
    expect(canActorTransition('owner', 'confirmed', 'no-show')).toBe(true)
  })

  /** Role never widens what the state machine allows. */
  it.each(['staff', 'owner', 'customer'] as const)(
    'never lets %s reopen a terminal booking',
    (actor) => {
      expect(canActorTransition(actor, 'cancelled', 'confirmed')).toBe(false)
      expect(canActorTransition(actor, 'completed', 'pending')).toBe(false)
      expect(canActorTransition(actor, 'no-show', 'confirmed')).toBe(false)
    },
  )

  /**
   * An update that leaves the status alone must pass for everyone, or a customer
   * editing their notes is refused for a transition they never asked for.
   */
  it.each(['staff', 'owner', 'customer'] as const)('lets %s leave the status alone', (actor) => {
    expect(canActorTransition(actor, 'pending', 'pending')).toBe(true)
  })
})

describe('availableActions', () => {
  it('offers an owner accept or decline on a pending booking', () => {
    expect(availableActions('owner', 'pending').sort()).toEqual(['cancelled', 'confirmed'])
  })

  it('offers a customer only cancellation', () => {
    expect(availableActions('customer', 'pending')).toEqual(['cancelled'])
    expect(availableActions('customer', 'confirmed')).toEqual(['cancelled'])
  })

  it('offers nothing once a booking is finished', () => {
    expect(availableActions('owner', 'cancelled')).toEqual([])
    expect(availableActions('staff', 'completed')).toEqual([])
  })
})
