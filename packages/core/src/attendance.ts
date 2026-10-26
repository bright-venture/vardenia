import type { BookingStatus } from './booking'

/**
 * Did the guest come? Asked of the guest, not only of the venue.
 *
 * Billing and the passport used to rest on the venue's word alone: a booking
 * the venue marked a no-show cost it nothing and earned the guest nothing,
 * whether or not they came. So after a visit the guest is asked too, and the
 * two answers are compared. Where they disagree the team is told and decides,
 * and that decision is what billing and the passport follow.
 *
 * Pure, and the clock is an argument, like the rest of this package.
 */

export const GUEST_ANSWERS = ['came', 'did-not-come'] as const
export type GuestAnswer = (typeof GUEST_ANSWERS)[number]

/** Whose account the team accepted, for a visit where the two disagreed. */
export const ATTENDANCE_VERDICTS = ['guest', 'venue'] as const
export type AttendanceVerdict = (typeof ATTENDANCE_VERDICTS)[number]

/**
 * Visits that ended before this keep the old passport rule, so nobody loses a
 * stamp they already had when guests started being asked.
 */
export const ATTENDANCE_START = new Date('2026-10-27T00:00:00Z')

/** How long after the visit ends the question is sent: long enough to be home. */
export const ASK_AFTER_HOURS = 2

/** Older visits are never asked about; the answer would be a guess. */
export const ASK_WITHIN_DAYS = 7

/** How long the guest has to answer, by email or from their passport. */
export const ANSWER_WITHIN_DAYS = 30

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** Statuses a visit can have once it has happened, or failed to. */
const ASKABLE: readonly BookingStatus[] = ['confirmed', 'completed', 'no-show']

export interface AttendanceFacts {
  status: BookingStatus
  end: Date
  guestAnswer?: GuestAnswer | null
  verdict?: AttendanceVerdict | null
}

/**
 * Where the guest and the venue disagree and nobody has decided yet.
 *
 * `guest-says-came` is the leak this exists for: a real visit marked a no-show
 * (or cancelled) so it is not billed. `guest-says-absent` is the opposite, a
 * visit billed that the guest says never happened.
 */
export type AttendanceMismatch = 'guest-says-came' | 'guest-says-absent'

export function attendanceMismatch(facts: AttendanceFacts): AttendanceMismatch | null {
  if (facts.verdict) return null
  if (
    facts.guestAnswer === 'came' &&
    (facts.status === 'no-show' || facts.status === 'cancelled')
  ) {
    return 'guest-says-came'
  }
  if (facts.guestAnswer === 'did-not-come' && facts.status === 'completed') {
    return 'guest-says-absent'
  }
  return null
}

const ended = (end: Date, now: Date) =>
  Number.isFinite(end.getTime()) && end.getTime() <= now.getTime()

/** Whether the guest should be sent the question now. */
export function shouldAskGuest(
  facts: AttendanceFacts & { askedAt?: Date | null },
  now: Date,
): boolean {
  if (facts.askedAt || facts.guestAnswer) return false
  if (!ASKABLE.includes(facts.status)) return false
  const end = facts.end.getTime()
  if (!Number.isFinite(end) || facts.end < ATTENDANCE_START) return false
  return (
    end + ASK_AFTER_HOURS * HOUR_MS <= now.getTime() &&
    end + ASK_WITHIN_DAYS * DAY_MS > now.getTime()
  )
}

/** Whether the guest may still answer. The first answer is final. */
export function canGuestAnswer(facts: AttendanceFacts, now: Date): boolean {
  if (facts.guestAnswer) return false
  if (!ASKABLE.includes(facts.status)) return false
  if (!ended(facts.end, now)) return false
  return facts.end.getTime() + ANSWER_WITHIN_DAYS * DAY_MS > now.getTime()
}

/** The last moment the guest can answer. */
export function answerDeadline(end: Date): Date {
  return new Date(end.getTime() + ANSWER_WITHIN_DAYS * DAY_MS)
}
