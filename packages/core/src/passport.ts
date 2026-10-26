import type { BookingStatus } from './booking'
import { AUTO_COMPLETE_DAYS, countsAsCompleted } from './booking-fees'
import {
  answerDeadline,
  ATTENDANCE_START,
  canGuestAnswer,
  type AttendanceVerdict,
  type GuestAnswer,
} from './attendance'
import { GOVERNORATES } from './regions'
import { SECTIONS } from './sections'

/**
 * The Vardenia passport: one stamp for each partner place a guest has been to.
 *
 * # A stamp is a finished booking, and nothing else
 *
 * Not a scan, not a check-in button. A printed code is in a magazine on a
 * kitchen table in Lyon as much as it is on a restaurant's door, so scanning
 * one proves nothing about where the reader is. A booking the venue honoured
 * does, and the venue has already said so in the one place it answers to.
 *
 * "Honoured" is the same rule the venue is billed on - see `countsAsCompleted`.
 * Marked completed, or confirmed and left unmarked for AUTO_COMPLETE_DAYS after
 * it ended. Keeping the two rules one rule means a guest never holds a stamp
 * for a visit the venue was not charged for, and a venue is never charged for
 * a visit the guest has no stamp for.
 *
 * # The week in between is shown, not hidden
 *
 * A confirmed booking that has ended but is still inside the window is a stamp
 * on its way: the venue can still mark it a no-show. Showing nothing for a week
 * after dinner reads as broken, so the passport shows it as pending, with the
 * day it will land.
 *
 * Everything here is pure and takes the clock as an argument, so the passport
 * a guest sees and the one the tests check are the same function.
 */

/** Points for the first stamp at a place. */
export const POINTS_NEW_PLACE = 10

/** Points for each later finished booking at a place already stamped. */
export const POINTS_RETURN_VISIT = 2

const DAY_MS = 86_400_000

export interface PassportVisit {
  businessId: string
  /** The booking itself, so the passport can ask the guest about it. */
  bookingId?: string
  status: BookingStatus
  end: Date
  /** Whether the guest said they came, and the team's decision if it was disputed. */
  guestAnswer?: GuestAnswer | null
  verdict?: AttendanceVerdict | null
  /** The listing's category, which is its section. */
  category?: string | null
  governorate?: string | null
}

export interface PassportStamp {
  businessId: string
  /** When the first honoured visit ended. The date on the stamp. */
  stampedOn: Date
  /** Honoured visits, the first included. */
  visits: number
  category: string | null
  governorate: string | null
}

export interface PendingStamp {
  businessId: string
  /**
   * Why there is no stamp yet:
   *  - `waiting`: a visit from before guests were asked, inside the venue's
   *    seven days. It lands on `landsBy` by itself.
   *  - `confirm`: the guest has not said whether they came. It lands when they
   *    do; `landsBy` is the last day they can.
   *  - `review`: the guest says they came and the venue says they did not. The
   *    team is checking.
   */
  kind: 'waiting' | 'confirm' | 'review'
  landsBy: Date
  /** The booking to answer about, for `confirm`. */
  bookingId?: string
}

export type MilestoneKey =
  'first' | 'five' | 'ten' | 'threeSections' | 'allSections' | 'threeRegions' | 'allRegions'

export interface Milestone {
  key: MilestoneKey
  /** How far along, capped at `target`. */
  count: number
  target: number
  reached: boolean
}

export interface Passport {
  /** Oldest first, the order they were earned in. */
  stamps: PassportStamp[]
  /** Places with a visit waiting out the window and no stamp yet. */
  pending: PendingStamp[]
  points: number
  milestones: Milestone[]
}

/**
 * Whether one booking stamps, is waiting to, or never will.
 *
 * # Since guests are asked (ATTENDANCE_START)
 *
 * A stamp needs the guest to say they came, and the venue not to say
 * otherwise. Until the guest answers, the visit is `confirm`: the passport asks
 * them. If they say they came and the venue marked a no-show, it is `review`
 * until the team decides, and the team's decision is final either way.
 *
 * # Before then
 *
 * The old rule, so nobody loses a stamp they already had: the venue's word, and
 * a confirmed visit left unmarked lands after AUTO_COMPLETE_DAYS (`pending`).
 */
export function stampStateOf(
  visit: Pick<PassportVisit, 'status' | 'end' | 'guestAnswer' | 'verdict'>,
  now: Date,
): 'stamped' | 'pending' | 'confirm' | 'review' | null {
  const end = visit.end.getTime()
  if (!Number.isFinite(end)) return null

  if (visit.end < ATTENDANCE_START) {
    if (countsAsCompleted(visit, now)) return 'stamped'
    if (visit.status === 'confirmed' && end < now.getTime()) return 'pending'
    return null
  }

  if (end > now.getTime()) return null
  if (visit.verdict === 'guest') return visit.guestAnswer === 'came' ? 'stamped' : null
  if (visit.guestAnswer === 'came') {
    if (visit.status === 'completed' || visit.status === 'confirmed') return 'stamped'
    if (visit.verdict === 'venue') return null
    if (visit.status === 'no-show' || visit.status === 'cancelled') return 'review'
    return null
  }
  if (visit.guestAnswer === 'did-not-come') return null
  if (visit.status === 'completed' || visit.status === 'confirmed') {
    return canGuestAnswer(visit, now) ? 'confirm' : null
  }
  return null
}

/** When two visits to one place are both unstamped, the one to show. */
const PENDING_RANK: Record<PendingStamp['kind'], number> = { confirm: 0, review: 1, waiting: 2 }

const milestone = (key: MilestoneKey, count: number, target: number): Milestone => ({
  key,
  count: Math.min(count, target),
  target,
  reached: count >= target,
})

export function buildPassport(visits: readonly PassportVisit[], now: Date): Passport {
  const stamped = new Map<string, PassportStamp>()
  const waiting = new Map<string, PendingStamp>()

  // Oldest first, so the first honoured visit is the one that dates the stamp.
  const ordered = [...visits].sort((a, b) => a.end.getTime() - b.end.getTime())

  for (const visit of ordered) {
    const state = stampStateOf(visit, now)
    if (state === 'stamped') {
      const stamp = stamped.get(visit.businessId)
      if (stamp) stamp.visits += 1
      else
        stamped.set(visit.businessId, {
          businessId: visit.businessId,
          stampedOn: visit.end,
          visits: 1,
          category: visit.category ?? null,
          governorate: visit.governorate ?? null,
        })
    } else if (state === 'pending' || state === 'confirm' || state === 'review') {
      const next: PendingStamp =
        state === 'pending'
          ? {
              businessId: visit.businessId,
              kind: 'waiting',
              landsBy: new Date(visit.end.getTime() + AUTO_COMPLETE_DAYS * DAY_MS),
            }
          : state === 'confirm'
            ? {
                businessId: visit.businessId,
                kind: 'confirm',
                landsBy: answerDeadline(visit.end),
                ...(visit.bookingId ? { bookingId: visit.bookingId } : {}),
              }
            : { businessId: visit.businessId, kind: 'review', landsBy: visit.end }
      const earlier = waiting.get(visit.businessId)
      const better =
        !earlier ||
        PENDING_RANK[next.kind] < PENDING_RANK[earlier.kind] ||
        (next.kind === earlier.kind && next.landsBy < earlier.landsBy)
      if (better) waiting.set(visit.businessId, next)
    }
  }

  const stamps = [...stamped.values()]
  const pending = [...waiting.values()]
    .filter((entry) => !stamped.has(entry.businessId))
    .sort(
      (a, b) =>
        PENDING_RANK[a.kind] - PENDING_RANK[b.kind] || a.landsBy.getTime() - b.landsBy.getTime(),
    )

  const visitsTotal = stamps.reduce((sum, stamp) => sum + stamp.visits, 0)
  const points =
    stamps.length * POINTS_NEW_PLACE + (visitsTotal - stamps.length) * POINTS_RETURN_VISIT

  const sections = new Set(
    stamps
      .map((stamp) => stamp.category)
      .filter((category) => SECTIONS.some((section) => section.category === category)),
  ).size
  const regions = new Set(
    stamps
      .map((stamp) => stamp.governorate)
      .filter((slug) => GOVERNORATES.some((governorate) => governorate.slug === slug)),
  ).size

  return {
    stamps,
    pending,
    points,
    milestones: [
      milestone('first', stamps.length, 1),
      milestone('five', stamps.length, 5),
      milestone('ten', stamps.length, 10),
      milestone('threeSections', sections, 3),
      milestone('allSections', sections, SECTIONS.length),
      milestone('threeRegions', regions, 3),
      milestone('allRegions', regions, GOVERNORATES.length),
    ],
  }
}
