import type { Payload } from 'payload'
import {
  countsAsCompleted,
  feeFor,
  hasFee,
  isPeriod,
  periodBounds,
  statementReadyOn,
  type BillableBooking,
  type BookingStatus,
  type FeeSettings,
} from '@vardenia/core'
import { beirutDate, beirutInstant } from './beirut'
import { findEvery } from './find-every'

/**
 * Drawing up a month of statements, and sending them.
 *
 * Staff run this from Booking fees in the admin (/admin/billing) on or after the
 * 8th of the next month. It does
 * three things, in order:
 *
 * 1. Marks as completed every confirmed booking of the month that ended at least
 *    seven days ago and was never marked. The venue had its week; the booking
 *    now reads the same in its dashboard as on its statement.
 * 2. Works out each booking's fee from the venue's own settings.
 * 3. Creates one draft statement per venue that owes something, skipping a venue
 *    that already has a statement for that month.
 *
 * Drafts, never sent. The team reads them before a venue does.
 */

export interface DrawUpResult {
  period: string
  created: number
  alreadyDrawnUp: number
  nothingOwed: number
  markedCompleted: number
  /** Venues whose bookings could not all be read. Nothing is created for them. */
  incomplete: string[]
}

interface BusinessRow {
  id: number
  name?: string | null
  bookingFee?: FeeSettings | null
}

interface BookingRow {
  id: number
  reference?: string | null
  start: string
  end: string
  partySize?: number | null
  status: BookingStatus
}

export class NotReadyError extends Error {}

/** Refuses a month whose bookings have not all had their seven days yet. */
export function assertReady(period: string, now: Date): void {
  if (!isPeriod(period)) throw new NotReadyError(`"${period}" is not a month like 2026-10.`)
  const ready = statementReadyOn(period)
  if (beirutDate(now) < ready) {
    throw new NotReadyError(
      `${period} can be drawn up from ${ready}, once every booking in it has had seven days to be marked.`,
    )
  }
}

export async function drawUpStatements(
  payload: Payload,
  period: string,
  now: Date = new Date(),
): Promise<DrawUpResult> {
  assertReady(period, now)

  const { first, next } = periodBounds(period)
  const from = beirutInstant(first, '00:00')
  const to = beirutInstant(next, '00:00')
  if (!from || !to) throw new NotReadyError(`Could not read the dates of ${period}.`)

  const result: DrawUpResult = {
    period,
    created: 0,
    alreadyDrawnUp: 0,
    nothingOwed: 0,
    markedCompleted: 0,
    incomplete: [],
  }

  const venues = await findEvery<BusinessRow>(payload, {
    collection: 'businesses',
    where: { 'bookingFee.unit': { exists: true } },
    depth: 0,
    overrideAccess: true,
    draft: true,
    select: { name: true, bookingFee: true },
  })

  for (const venue of venues.docs) {
    if (!hasFee(venue.bookingFee)) continue

    const existing = await payload.find({
      collection: 'statements',
      where: {
        and: [
          { business: { equals: venue.id } },
          { period: { equals: period } },
          { status: { not_equals: 'void' } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.totalDocs > 0) {
      result.alreadyDrawnUp += 1
      continue
    }

    const bookings = await findEvery<BookingRow>(payload, {
      collection: 'bookings',
      where: {
        and: [
          { business: { equals: venue.id } },
          { start: { greater_than_equal: from.toISOString() } },
          { start: { less_than: to.toISOString() } },
          { status: { in: ['confirmed', 'completed'] } },
        ],
      },
      depth: 0,
      overrideAccess: true,
      sort: 'start',
    })

    // A statement missing bookings would undercharge without anyone noticing.
    // Better none, and a name on the page saying why.
    if (!bookings.complete) {
      result.incomplete.push(String(venue.name ?? venue.id))
      continue
    }

    const lines = []
    for (const row of bookings.docs) {
      const billable: BillableBooking = {
        start: new Date(row.start),
        end: new Date(row.end),
        partySize: Number(row.partySize ?? 1),
        status: row.status,
        day: beirutDate(new Date(row.start)),
      }

      // Step 1: the seven-day rule, written onto the booking itself.
      if (row.status === 'confirmed' && countsAsCompleted(billable, now)) {
        await payload.update({
          collection: 'bookings',
          id: row.id,
          data: { status: 'completed' },
          depth: 0,
          overrideAccess: true,
          context: { autoCompleted: true },
        })
        billable.status = 'completed'
        result.markedCompleted += 1
      }

      const fee = feeFor(venue.bookingFee, billable, now)
      if (!fee) continue

      lines.push({
        booking: row.id,
        reference: row.reference ?? '',
        day: billable.day,
        unit: fee.unit,
        quantity: fee.quantity,
        rate: fee.rate,
        amount: fee.amount,
        disputeOutcome: 'none' as const,
      })
    }

    if (lines.length === 0) {
      result.nothingOwed += 1
      continue
    }

    await payload.create({
      collection: 'statements',
      data: { business: venue.id, period, status: 'draft', lines },
      overrideAccess: true,
    })
    result.created += 1
  }

  return result
}

/** Sends every draft of the month: stamps the deadlines and emails each venue. */
export async function sendDrafts(payload: Payload, period: string): Promise<number> {
  if (!isPeriod(period)) return 0

  const drafts = await findEvery<{ id: number }>(payload, {
    collection: 'statements',
    where: { and: [{ period: { equals: period } }, { status: { equals: 'draft' } }] },
    depth: 0,
    overrideAccess: true,
  })

  for (const draft of drafts.docs) {
    await payload.update({
      collection: 'statements',
      id: draft.id,
      data: { status: 'sent' },
      overrideAccess: true,
    })
  }
  return drafts.docs.length
}
