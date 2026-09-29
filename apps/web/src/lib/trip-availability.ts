import { getPayload } from 'payload'
import { OCCUPYING_STATUSES, type BookingStatus } from '@vardenia/core'
import config from '../payload.config'
import {
  checkAvailability,
  resolveRules,
  type Availability,
  type BookingRules,
  type ClosedPeriod,
  type ExistingBooking,
} from './availability'
import type { OpeningHour } from './hours'
import { addDays } from './beirut'
import { tripInterval, type Trip } from './trip'

/**
 * Whether each bookable place on a page could take a guest's plans.
 *
 * What lets a card in the directory say "Available Sat 3 Oct, 20:00". It is the
 * booking's own check (`checkAvailability`: rules, opening hours, closures and
 * the bookings already made), run for every listing on the page that takes
 * bookings, and it is the same answer the Book form would get if the guest
 * submitted then.
 *
 * # A hint, not a hold
 *
 * The same caveat as /booking/availability: "available" means worth asking,
 * never reserved. Two guests can see the same last table, and the booking
 * itself is what decides. The card never says how many places are left, which
 * would tell a competitor how full a restaurant is.
 *
 * # Two queries for the page, not two per card
 *
 * Bookings and closures for every bookable listing on the page are read at once,
 * over the span that covers all of their intervals, and sorted per listing in
 * memory. A page holds 24 listings, so this is two round trips whatever is on it.
 *
 * Never cached: bookings change by the minute. Never fatal: if the reads fail,
 * the cards show no line at all rather than a wrong one.
 */

export type TripVerdict =
  | { kind: 'free' }
  | { kind: 'full' }
  | { kind: 'closed' }
  | { kind: 'party' }
  | { kind: 'notice' }
  | { kind: 'other' }

/** The check's reason, reduced to what a card can usefully say. */
export function verdictFrom(result: Availability): TripVerdict {
  if (result.ok) return { kind: 'free' }
  switch (result.reason) {
    case 'at-capacity':
      return { kind: 'full' }
    case 'closed':
    case 'closed-period':
      return { kind: 'closed' }
    case 'party-too-large':
    case 'party-too-small':
      return { kind: 'party' }
    case 'too-soon':
      return { kind: 'notice' }
    default:
      return { kind: 'other' }
  }
}

/** The fields of a listing the check reads. Every ListingSummary has them. */
export interface TripListing {
  id: number
  booking?: unknown
  openingHours?: unknown
}

/**
 * The verdict for one listing, from what was read for it. Pure, so the whole
 * decision is testable without a database.
 */
export function tripVerdictFor(
  listing: TripListing,
  trip: Trip,
  existing: ExistingBooking[],
  closures: ClosedPeriod[],
  now: Date = new Date(),
): TripVerdict | null {
  const rules = listing.booking as BookingRules | null | undefined
  if (!resolveRules(rules).enabled) return null

  const interval = tripInterval(trip, rules, now)
  if (!interval) return { kind: 'other' }

  return verdictFrom(
    checkAvailability({
      rules,
      hours: listing.openingHours as OpeningHour[] | null | undefined,
      closures,
      existing,
      request: { interval: { start: interval.start, end: interval.end }, partySize: trip.party },
      now,
    }),
  )
}

const idOf = (value: unknown): number | null => {
  const id = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
  const n = Number(id)
  return Number.isFinite(n) ? n : null
}

export async function tripVerdicts(
  listings: TripListing[],
  trip: Trip | null,
): Promise<Map<number, TripVerdict>> {
  const verdicts = new Map<number, TripVerdict>()
  if (!trip) return verdicts

  const now = new Date()
  const bookable = listings.flatMap((listing) => {
    const rules = listing.booking as BookingRules | null | undefined
    if (!resolveRules(rules).enabled) return []
    const interval = tripInterval(trip, rules, now)
    return interval ? [{ listing, interval }] : []
  })
  if (bookable.length === 0) return verdicts

  const ids = bookable.map((entry) => entry.listing.id)
  const from = new Date(Math.min(...bookable.map((entry) => entry.interval.start.getTime())))
  const to = new Date(Math.max(...bookable.map((entry) => entry.interval.end.getTime())))

  try {
    const payload = await getPayload({ config })

    // Read with access overridden, as the booking's own check does: a guest
    // cannot read bookings or closures, and only verdicts leave this function.
    const [bookings, closed] = await Promise.all([
      payload.find({
        collection: 'bookings',
        depth: 0,
        pagination: false,
        limit: 2000,
        overrideAccess: true,
        select: { business: true, start: true, end: true, status: true },
        where: {
          and: [
            { business: { in: ids } },
            { status: { in: [...OCCUPYING_STATUSES] } },
            { start: { less_than: to.toISOString() } },
            { end: { greater_than: from.toISOString() } },
          ],
        },
      }),
      payload.find({
        collection: 'closures',
        depth: 0,
        pagination: false,
        limit: 500,
        overrideAccess: true,
        select: { business: true, startsOn: true, endsOn: true },
        where: {
          and: [
            { business: { in: ids } },
            // `endsOn` is inclusive; a stay can run past the plan's first day.
            { endsOn: { greater_than_equal: trip.date } },
            { startsOn: { less_than_equal: addDays(trip.date, trip.nights + 1) } },
          ],
        },
      }),
    ])

    const existingBy = new Map<number, ExistingBooking[]>()
    for (const doc of bookings.docs) {
      const business = idOf((doc as { business?: unknown }).business)
      const start = new Date(String((doc as { start?: unknown }).start))
      const end = new Date(String((doc as { end?: unknown }).end))
      if (business === null || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        continue
      }
      const list = existingBy.get(business) ?? []
      list.push({ start, end, status: (doc as { status: BookingStatus }).status })
      existingBy.set(business, list)
    }

    const closuresBy = new Map<number, ClosedPeriod[]>()
    for (const doc of closed.docs) {
      const business = idOf((doc as { business?: unknown }).business)
      if (business === null) continue
      const list = closuresBy.get(business) ?? []
      list.push({
        startsOn: String((doc as { startsOn?: unknown }).startsOn ?? ''),
        endsOn: String((doc as { endsOn?: unknown }).endsOn ?? ''),
      })
      closuresBy.set(business, list)
    }

    for (const { listing } of bookable) {
      const verdict = tripVerdictFor(
        listing,
        trip,
        existingBy.get(listing.id) ?? [],
        closuresBy.get(listing.id) ?? [],
        now,
      )
      if (verdict) verdicts.set(listing.id, verdict)
    }
  } catch {
    verdicts.clear()
  }

  return verdicts
}
