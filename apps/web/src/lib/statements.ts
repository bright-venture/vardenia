import { isUniqueViolation } from './db-errors'
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
import { venueOwnerEmails } from './booking-email'

/**
 * Drawing up a month of statements, and sending them.
 *
 * Staff run this from Booking fees in the admin (/admin/billing) on or after the
 * 8th of the next month. It does
 * three things, in order:
 *
 * A booking belongs to the month it ENDS in (see the query below for why).
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

    /**
     * A month's bookings are the ones that ENDED in it, not the ones that began.
     *
     * A booking only counts once it ended seven days ago, and the month is
     * drawn up on the 8th of the next. Selected by start, a stay from 30
     * October to 2 November was not yet countable when October was drawn up
     * (it ended too recently) and was outside November's query (it started in
     * October), so it was billed in neither and stayed confirmed for ever.
     * Selected by end, everything in the month ended by its last minute, so
     * all of it has had its seven days by the 8th.
     */
    const bookings = await findEvery<BookingRow>(payload, {
      collection: 'bookings',
      where: {
        and: [
          { business: { equals: venue.id } },
          { end: { greater_than_equal: from.toISOString() } },
          { end: { less_than: to.toISOString() } },
          { status: { in: ['confirmed', 'completed'] } },
        ],
      },
      depth: 0,
      overrideAccess: true,
      sort: 'start',
    })

    /**
     * Never a booking that is already on a live statement.
     *
     * Months used to be chosen by start date, so a stay that crossed a month
     * end may already be on the earlier month's statement. Checking the lines
     * themselves, rather than reasoning about which rule applied when, keeps
     * any booking from being billed twice whatever the history.
     */
    const issued = await findEvery<{ lines?: { booking?: unknown }[] | null }>(payload, {
      collection: 'statements',
      where: {
        and: [{ business: { equals: venue.id } }, { status: { not_equals: 'void' } }],
      },
      depth: 0,
      overrideAccess: true,
      select: { lines: true },
    })

    // A statement missing bookings would undercharge without anyone noticing,
    // and one that cannot see earlier statements could charge twice. Better
    // none, and a name on the page saying why.
    if (!bookings.complete || !issued.complete) {
      result.incomplete.push(String(venue.name ?? venue.id))
      continue
    }

    const alreadyBilled = new Set(
      issued.docs.flatMap((statement) =>
        (statement.lines ?? []).map((line) => {
          const booking = line.booking as { id?: unknown } | number | string | null | undefined
          return String(typeof booking === 'object' && booking !== null ? booking.id : booking)
        }),
      ),
    )

    const lines = []
    for (const row of bookings.docs) {
      if (alreadyBilled.has(String(row.id))) continue

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

    const outcome = await createStatement(payload, { business: venue.id, period, lines })
    if (outcome === 'already-drawn-up') {
      result.alreadyDrawnUp += 1
      continue
    }
    result.created += 1
  }

  return result
}

export interface SendResult {
  sent: number
  /** Venues whose draft was left unsent because nobody there can receive it. */
  noRecipient: string[]
}

/**
 * Sends every draft of the month: stamps the deadlines and emails each venue.
 *
 * Except a venue with no partner account. Sending starts its seven days to
 * question a line and fifteen to pay, and it used to start them with nobody
 * told: the email went to no one and nothing was reported. Its draft is now
 * left as a draft and named, so the team can give the venue an account and
 * send again, or deliver it another way and set it to Sent by hand.
 */
export async function sendDrafts(
  payload: Payload,
  period: string,
  now: Date = new Date(),
): Promise<SendResult> {
  if (!isPeriod(period)) return { sent: 0, noRecipient: [] }
  /*
   * The same readiness rule as drawing up. A draft can exist early - drawn up by
   * hand, or from a run before the rule moved - and sending it would bill a
   * month whose bookings have not had their seven days to be marked.
   */
  assertReady(period, now)

  const drafts = await findEvery<{ id: number; business?: unknown }>(payload, {
    collection: 'statements',
    where: { and: [{ period: { equals: period } }, { status: { equals: 'draft' } }] },
    depth: 0,
    overrideAccess: true,
  })

  const result: SendResult = { sent: 0, noRecipient: [] }
  for (const draft of drafts.docs) {
    const business = draft.business as { id?: unknown } | number | string | null | undefined
    const businessId = typeof business === 'object' && business !== null ? business.id : business
    if (typeof businessId !== 'number' && typeof businessId !== 'string') continue

    if ((await venueOwnerEmails(payload, businessId)).length === 0) {
      const venue = await payload
        .findByID({ collection: 'businesses', id: businessId, depth: 0, overrideAccess: true })
        .catch(() => null)
      result.noRecipient.push(String((venue as { name?: unknown } | null)?.name ?? businessId))
      continue
    }

    await payload.update({
      collection: 'statements',
      id: draft.id,
      data: { status: 'sent' },
      overrideAccess: true,
    })
    result.sent += 1
  }
  return result
}

/**
 * Creates one venue's statement, and says when the month was already drawn up.
 *
 * "Already drawn up" used to be the answer to any unique refusal, which also
 * covered a clash on the statement number: the venue was reported as done
 * when nothing had been written for it. Now it is the answer only when a live
 * statement for that venue and month is actually there, whichever check
 * refused this one. Any other refusal - a
 * number clash, which the numbering lock in collections/Statements should have
 * made impossible - is tried again, and a third failure is an error, never a
 * quiet "done".
 */
export async function createStatement(
  payload: Payload,
  data: { business: number | string; period: string; lines: unknown[] },
  attempts = 3,
): Promise<'created' | 'already-drawn-up'> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await payload.create({
        collection: 'statements',
        data: { ...data, status: 'draft' } as never,
        overrideAccess: true,
      })
      return 'created'
    } catch (error) {
      // Whatever refused it, a live statement for this venue and month means
      // the month is drawn up: by the index, or by the statement's own check.
      const live = await payload.find({
        collection: 'statements',
        where: {
          and: [
            { business: { equals: data.business } },
            { period: { equals: data.period } },
            { status: { not_equals: 'void' } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (live.totalDocs > 0) return 'already-drawn-up'
      if (!isUniqueViolation(error) || attempt >= attempts) throw error
    }
  }
}
