import type { CollectionBeforeChangeHook } from 'payload'
import {
  attendanceMismatch,
  type AttendanceVerdict,
  type BookingStatus,
  type GuestAnswer,
} from '@vardenia/core'

/**
 * Keeps `attendanceDisputed` true exactly while the guest and the venue
 * disagree and the team has not decided (core/attendanceMismatch).
 *
 * Stored rather than worked out on reading, so the admin can list, count and
 * filter disputed visits like any other field: the home page's to-do list and
 * the bookings list both read it. Recomputed on every save from the booking as
 * it will be after the save, so a status change, the guest's answer and the
 * team's decision all keep it right.
 */
export const markAttendanceDispute: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const next = { ...(originalDoc ?? {}), ...(data ?? {}) } as {
    status?: BookingStatus
    end?: string
    guestAnswer?: GuestAnswer | null
    attendanceVerdict?: AttendanceVerdict | null
  }
  if (!next.status || !next.end) return data
  data.attendanceDisputed =
    attendanceMismatch({
      status: next.status,
      end: new Date(next.end),
      guestAnswer: next.guestAnswer ?? null,
      verdict: next.attendanceVerdict ?? null,
    }) !== null
  return data
}
