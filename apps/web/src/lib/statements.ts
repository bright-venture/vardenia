import { isUniqueViolation } from './db-errors'
import type { Payload, Where } from 'payload'
import {
  commissionFor,
  countsAsCompleted,
  effectiveRate,
  isPeriod,
  periodBounds,
  statementReadyOn,
  type AttendanceVerdict,
  type BillableBooking,
  type BookingStatus,
  type GuestAnswer,
} from '@vardenia/core'
import { beirutDate, beirutInstant } from './beirut'
import { findEvery } from './find-every'
import { venueOwnerEmails } from './booking-email'

/**
 * Drawing up a month of statements, and sending them.
 *
 * Staff run this from Commissions in the admin (/admin/billing) on or after the
 * 8th of the next month. It does
 * three things, in order:
 *
 * A booking belongs to the month it ENDS in (see the query below for why).
 *
 * 1. Marks as completed every confirmed booking of the month that ended at least
 *    seven days ago and was never marked. The venue had its week; the booking
 *    now reads the same in its dashboard as on its statement.
 * 2. Works out each booking's commission: the venue's rate, or the default on
 *    the Commissions page, of what the guest spent (core/booking-fees).
 * 3. Creates one draft statement per venue that owes something, skipping a venue
 *    that already has a statement for that month.
 *
 * A booking the guest came to but nobody gave an amount for is not billed and
 * not dropped: it is named in the result, for the team to ask the venue, and
 * billed on a later month once the amount is in.
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
  /** "Venue (REFERENCE)" for each visit owed but with no amount yet. */
  missingAmount: string[]
  /** Venues with visits to bill but no rate, here or on the Commissions page. */
  noRate: string[]
}

interface BusinessRow {
  id: number
  name?: string | null
  commission?: { rate?: number | null; waivedUntil?: string | null } | null
}

interface BookingRow {
  id: number
  business?: unknown
  reference?: string | null
  start: string
  end: string
  partySize?: number | null
  status: BookingStatus
  amount?: number | null
  guestAmount?: number | null
  guestAnswer?: GuestAnswer | null
  attendanceVerdict?: AttendanceVerdict | null
}

const idOf = (value: unknown): number | string | null => {
  const id = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

/**
 * The bookings a month's statements are drawn from, for one venue or all.
 *
 * Everything that ended before the month was out, not only what ended in it:
 * a visit owed but missing its amount is billed on the first month after the
 * amount arrives, and a dispute settled late lands on the month it was settled
 * in. Nothing is billed twice, because each venue's earlier lines are checked
 * below. countsAsCompleted has the final say on each.
 */
const candidates = (to: Date, business?: number | string): Where => ({
  and: [
    ...(business !== undefined ? [{ business: { equals: business } }] : []),
    { end: { less_than: to.toISOString() } },
    {
      or: [
        { status: { in: ['confirmed', 'completed'] } },
        { attendanceVerdict: { equals: 'guest' } },
      ],
    },
  ],
})

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

  const { next } = periodBounds(period)
  const to = beirutInstant(next, '00:00')
  if (!to) throw new NotReadyError(`Could not read the dates of ${period}.`)

  const result: DrawUpResult = {
    period,
    created: 0,
    alreadyDrawnUp: 0,
    nothingOwed: 0,
    markedCompleted: 0,
    incomplete: [],
    missingAmount: [],
    noRate: [],
  }

  const settings = (await payload
    .findGlobal({ slug: 'commission-settings', depth: 0, overrideAccess: true })
    .catch(() => null)) as { defaultRate?: number | null } | null
  const defaultRate = settings?.defaultRate ?? null

  // The venues with anything to bill, rather than every listing in the directory.
  const owed = await findEvery<BookingRow>(payload, {
    collection: 'bookings',
    where: candidates(to),
    depth: 0,
    overrideAccess: true,
    select: { business: true },
  })
  const venueIds = [
    ...new Set(owed.docs.map((row) => idOf(row.business)).filter((id) => id !== null)),
  ]
  const venues =
    venueIds.length === 0
      ? { docs: [] as BusinessRow[] }
      : await findEvery<BusinessRow>(payload, {
          collection: 'businesses',
          where: { id: { in: venueIds } },
          depth: 0,
          overrideAccess: true,
          draft: true,
          select: { name: true, commission: true },
        })

  for (const venue of venues.docs) {
    const rate = effectiveRate(venue.commission?.rate, defaultRate)
    if (rate === null || rate <= 0) {
      if (rate === null) result.noRate.push(String(venue.name ?? venue.id))
      continue
    }
    const terms = { rate, waivedUntil: venue.commission?.waivedUntil?.slice(0, 10) ?? null }

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
      where: candidates(to, venue.id),
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
        amount: row.amount ?? null,
        guestAmount: row.guestAmount ?? null,
        day: beirutDate(new Date(row.start)),
        guestAnswer: row.guestAnswer ?? null,
        verdict: row.attendanceVerdict ?? null,
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

      const line = commissionFor(terms, billable, now)
      if (line === 'no-amount') {
        result.missingAmount.push(`${venue.name ?? venue.id} (${row.reference ?? row.id})`)
        continue
      }
      if (!line) continue

      lines.push({
        booking: row.id,
        reference: row.reference ?? '',
        day: billable.day,
        base: line.base,
        rate: line.rate,
        amount: line.amount,
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
