import type { Payload, Where } from 'payload'
import {
  ATTENDANCE_START,
  stampStateOf,
  type AttendanceVerdict,
  type BookingStatus,
  type GuestAnswer,
} from '@vardenia/core'

/**
 * Deleting what the privacy policy says is only kept for a while.
 *
 * The policy (lib/legal, "How long we keep it") promised periods before any
 * code kept them: bookings and receipts 12 months after the visit, printed-code
 * scans 12 months, error records 90 days. This is that code. It runs hourly
 * through POST /booking/retention (netlify/functions/apply-retention.mts), a
 * batch at a time, so the first run's backlog clears over a few hours and every
 * run after that has almost nothing to do.
 *
 * # A visit is cut down, not deleted
 *
 * A passport stamp is not stored anywhere: it is worked out from the booking
 * every time (lib/passport, core/passport). Deleting a year-old booking would
 * take the stamp with it, so the owner decided on 10 November 2026 that a
 * booking that became a visit keeps what the stamp is made of (the place, the
 * date, the party size, the status, and that the guest came) until the account
 * is closed, and loses everything else: notes, receipts and their photos, the
 * amounts, staff notes and the decline reason. Every other old booking is
 * deleted outright, and so is every old booking of a closed account, which has
 * no passport left to show.
 *
 * Bills do not need the booking: a statement line carries its own copy of the
 * booking reference, the day and the amounts (collections/Statements), and the
 * link to the booking simply empties when it goes.
 *
 * # Underneath the hooks, on purpose
 *
 * The booking hooks email guests and the team when a status, an amount or a
 * receipt changes. Clearing a year-old amount must not tell the team about a
 * new disagreement, so bookings are changed and deleted with `payload.db`,
 * which writes the row and runs no hooks. Receipts are the exception: they are
 * deleted through Payload, because its storage hook is what removes the photo
 * from the bucket, and the one hook that would touch the booking afterwards
 * stands down when it sees RETENTION_CONTEXT.
 */

/** How long each kind of record is kept. The privacy policy says the same. */
export const RETENTION = {
  bookingMonths: 12,
  scanMonths: 12,
  errorDays: 90,
} as const

/** Bookings changed per run. Hourly runs clear a backlog of 4,800 a day. */
export const BOOKING_BATCH = 200

/** Pages of already-finished visits read past in one run, at most. */
const MAX_PAGES = 10

/** Set on receipt deletions made here, so the receipt hooks leave the booking alone. */
export const RETENTION_CONTEXT = 'retention'

/** What a kept visit loses after 12 months. Everything not needed for its stamp. */
export const CUT_DOWN: Readonly<Record<string, null>> = {
  notes: null,
  internalNotes: null,
  declineReason: null,
  amount: null,
  amountEnteredAt: null,
  receipt: null,
  receiptAmount: null,
  guestAmount: null,
  guestAnsweredAt: null,
  attendanceAskedAt: null,
}

/** `months` calendar months before `now`. */
export function monthsBefore(now: Date, months: number): Date {
  const date = new Date(now)
  date.setUTCMonth(date.getUTCMonth() - months)
  return date
}

/** `days` days before `now`. */
export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

export interface OldBooking {
  id: number | string
  status: BookingStatus
  end: string | Date
  customer?: number | string | null
  guestAnswer?: GuestAnswer | null
  attendanceVerdict?: AttendanceVerdict | null
  [field: string]: unknown
}

export type BookingFate = 'cut-down' | 'delete'

/**
 * What happens to a booking whose visit ended more than 12 months ago.
 *
 * Kept, cut down, only when it still earns a stamp for an open account.
 */
export function fateOf(
  booking: OldBooking,
  now: Date,
  closedCustomers: ReadonlySet<string>,
): BookingFate {
  const customer = booking.customer == null ? null : String(booking.customer)
  if (customer === null || closedCustomers.has(customer)) return 'delete'

  const state = stampStateOf(
    {
      status: booking.status,
      end: new Date(booking.end),
      guestAnswer: booking.guestAnswer ?? null,
      verdict: booking.attendanceVerdict ?? null,
    },
    now,
  )
  return state === 'stamped' ? 'cut-down' : 'delete'
}

/** Whether a kept visit still holds anything it should have lost. */
export function needsCutting(booking: Record<string, unknown>): boolean {
  return Object.keys(CUT_DOWN).some((field) => {
    const value = booking[field]
    return value !== null && value !== undefined && value !== ''
  })
}

/**
 * The old bookings that may still need work, so a kept visit that has already
 * been cut down is not read again every hour for ever.
 *
 * Wide on purpose: anything holding a field a kept visit loses, anything that
 * cannot be a stamp by status or answer, and anything of a closed account.
 * fateOf makes the real decision on each.
 */
export function oldBookingsWhere(cutoff: Date, closedCustomers: readonly string[]): Where {
  const holdsSomething: Where[] = Object.keys(CUT_DOWN).map((field) => ({
    [field]: { exists: true },
  }))

  return {
    and: [
      { end: { less_than: cutoff.toISOString() } },
      {
        or: [
          ...holdsSomething,
          { status: { not_in: ['completed', 'confirmed'] } },
          // Since guests are asked, only "I came" stamps.
          {
            and: [
              { end: { greater_than_equal: ATTENDANCE_START.toISOString() } },
              { or: [{ guestAnswer: { exists: false } }, { guestAnswer: { not_equals: 'came' } }] },
            ],
          },
          ...(closedCustomers.length > 0 ? [{ customer: { in: [...closedCustomers] } }] : []),
        ],
      },
    ],
  }
}

export interface RetentionResult {
  /** Old visits cut down to what their stamp needs. */
  cutDown: number
  /** Old bookings deleted. */
  deleted: number
  /** Receipts deleted, photos included. */
  receipts: number
  scans: number
  errors: number
  /** Old bookings still waiting for a later run. */
  remaining: number
  failed: number
  dryRun: boolean
}

/**
 * One run. `dryRun` counts what would happen and changes nothing, for checking
 * a run against production before trusting it.
 */
export async function applyRetention(
  payload: Payload,
  { now = new Date(), dryRun = false, batch = BOOKING_BATCH } = {},
): Promise<RetentionResult> {
  const bookingCutoff = monthsBefore(now, RETENTION.bookingMonths)
  const result: RetentionResult = {
    cutDown: 0,
    deleted: 0,
    receipts: 0,
    scans: 0,
    errors: 0,
    remaining: 0,
    failed: 0,
    dryRun,
  }

  const closed = await payload.find({
    collection: 'customers',
    where: { deletedAt: { exists: true } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: {},
  })
  const closedIds = closed.docs.map((doc) => String(doc.id))
  const closedSet = new Set(closedIds)

  /*
   * A kept visit that is already cut down can still match the query (a stamp
   * the team gave a guest over a venue's no-show keeps its no-show status), so
   * this reads on past those until it has a batch of real work or runs out.
   * Deleted rows drop out of the query, so the page only moves on by what was
   * left in place.
   */
  const work: OldBooking[] = []
  let skipped = 0
  let page = 1
  let matched = 0
  for (let reads = 0; reads < MAX_PAGES && work.length < batch; reads += 1) {
    const old = await payload.find({
      collection: 'bookings',
      where: oldBookingsWhere(bookingCutoff, closedIds),
      sort: 'id',
      limit: batch,
      page,
      depth: 0,
      overrideAccess: true,
    })
    if (reads === 0) matched = old.totalDocs
    for (const doc of old.docs as unknown as OldBooking[]) {
      if (fateOf(doc, now, closedSet) === 'cut-down' && !needsCutting(doc)) skipped += 1
      else if (work.length < batch) work.push(doc)
    }
    if (!old.hasNextPage) break
    page += 1
  }
  result.remaining = Math.max(0, matched - skipped - work.length)

  for (const doc of work) {
    const fate = fateOf(doc, now, closedSet)

    try {
      result.receipts += await deleteReceipts(payload, { booking: { equals: doc.id } }, dryRun)
      if (!dryRun) {
        if (fate === 'delete') {
          await payload.db.deleteOne({ collection: 'bookings', where: { id: { equals: doc.id } } })
        } else {
          const row = await payload.db.findOne<{ id: number | string } & Record<string, unknown>>({
            collection: 'bookings',
            where: { id: { equals: doc.id } },
          })
          if (row) {
            await payload.db.updateOne({
              collection: 'bookings',
              id: doc.id,
              data: { ...row, ...CUT_DOWN },
              returning: false,
            })
          }
        }
      }
      if (fate === 'delete') result.deleted += 1
      else result.cutDown += 1
    } catch (error) {
      result.failed += 1
      payload.logger.error({ err: error, booking: doc.id }, 'retention: booking not processed')
    }
  }

  // A receipt whose booking is gone, so no booking above led to it.
  result.receipts += await deleteReceipts(
    payload,
    {
      and: [
        { booking: { exists: false } },
        { createdAt: { less_than: bookingCutoff.toISOString() } },
      ],
    },
    dryRun,
  )

  result.scans = await deleteOlderThan(
    payload,
    'scan-events',
    { scannedAt: { less_than: monthsBefore(now, RETENTION.scanMonths).toISOString() } },
    dryRun,
  )
  result.errors = await deleteOlderThan(
    payload,
    'error-events',
    { lastSeen: { less_than: daysBefore(now, RETENTION.errorDays).toISOString() } },
    dryRun,
  )

  return result
}

/** Deletes the matching receipts through Payload, so their photos go too. */
async function deleteReceipts(payload: Payload, where: Where, dryRun: boolean): Promise<number> {
  const found = await payload.find({
    collection: 'receipts',
    where,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: {},
  })
  if (dryRun) return found.docs.length

  let deleted = 0
  for (const receipt of found.docs) {
    await payload.delete({
      collection: 'receipts',
      id: receipt.id,
      overrideAccess: true,
      context: { [RETENTION_CONTEXT]: true },
    })
    deleted += 1
  }
  return deleted
}

/** Deletes rows with no hooks and no files in one statement, returning how many. */
async function deleteOlderThan(
  payload: Payload,
  collection: 'scan-events' | 'error-events',
  where: Where,
  dryRun: boolean,
): Promise<number> {
  const { totalDocs } = await payload.count({ collection, where, overrideAccess: true })
  if (totalDocs > 0 && !dryRun) await payload.db.deleteMany({ collection, where })
  return totalDocs
}
