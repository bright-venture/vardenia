import type { CollectionAfterChangeHook } from 'payload'
import {
  attendanceMismatch,
  type AttendanceVerdict,
  type BookingStatus,
  type GuestAnswer,
} from '@vardenia/core'
import { alertTeam } from '../lib/attendance'

/**
 * Tells the team when a venue's change disagrees with what the guest said.
 *
 * The guest's answer raises its own alert when it arrives (lib/attendance).
 * This is the other order: the guest said "I came", and the venue marks the
 * booking a no-show or cancels it afterwards, or enters an amount far from the
 * guest's. Only on a change of status or amount, and only when the booking was
 * not already in dispute, so one dispute is one email.
 */

interface Facts {
  status: BookingStatus
  end: string
  guestAnswer?: GuestAnswer | null
  attendanceVerdict?: AttendanceVerdict | null
  amount?: number | null
  guestAmount?: number | null
}

const mismatchOf = (doc: Facts | undefined) =>
  doc
    ? attendanceMismatch({
        status: doc.status,
        end: new Date(doc.end),
        guestAnswer: doc.guestAnswer ?? null,
        verdict: doc.attendanceVerdict ?? null,
        amount: doc.amount ?? null,
        guestAmount: doc.guestAmount ?? null,
      })
    : null

export const alertAttendanceMismatch: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
  context,
}) => {
  if (operation !== 'update' || context?.attendance) return doc
  const before = previousDoc as Facts | undefined
  const after = doc as Facts
  if (!before) return doc
  if (before.status === after.status && (before.amount ?? null) === (after.amount ?? null))
    return doc

  const now = mismatchOf(after)
  if (now && !mismatchOf(before)) await alertTeam(req.payload, (doc as { id: number }).id, now)
  return doc
}
