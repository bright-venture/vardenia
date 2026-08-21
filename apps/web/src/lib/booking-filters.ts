import type { Where } from 'payload'
import { BOOKING_STATUSES, type BookingStatus } from '@vardenia/core'

/**
 * Turning a query string into a bookings query.
 *
 * The partner dashboard began as three fixed lists - requests, upcoming, past -
 * which is the right shape for a venue with four bookings and the wrong one the
 * moment it has four hundred. A restaurant looking for one table on Saturday
 * should not be scrolling.
 *
 * # Filters live in the URL
 *
 * Same choice as the public directory, for the same reasons: every view is a
 * real address somebody can bookmark, reload, or send to the colleague who
 * actually answers the phone. It also means the page stays a server component
 * with no client state to fall out of step with what is on screen.
 *
 * # Parsed, not trusted
 *
 * Everything here arrives from a query string, so an unknown status or an
 * invented window falls back to the default rather than reaching the database.
 * Anything that did reach it would be filtered by the collection's own access
 * rules anyway - an owner's query is constrained to their own listings before it
 * runs - but a filter that silently means nothing is a page that looks broken,
 * and one that throws is worse.
 */

export const BOOKING_WINDOWS = ['upcoming', 'past', 'all'] as const
export type BookingWindow = (typeof BOOKING_WINDOWS)[number]

export interface BookingFilter {
  status: BookingStatus | 'all'
  window: BookingWindow
  /** A reference, or part of a guest's name. Trimmed; empty means no search. */
  search: string
}

export const DEFAULT_FILTER: BookingFilter = {
  status: 'all',
  window: 'upcoming',
  search: '',
}

const isStatus = (value: unknown): value is BookingStatus =>
  BOOKING_STATUSES.includes(value as BookingStatus)

const isWindow = (value: unknown): value is BookingWindow =>
  BOOKING_WINDOWS.includes(value as BookingWindow)

export interface RawFilterParams {
  status?: string
  window?: string
  q?: string
}

export function parseBookingFilter(params: RawFilterParams | undefined): BookingFilter {
  const status = params?.status
  const window = params?.window

  return {
    status: isStatus(status) ? status : 'all',
    window: isWindow(window) ? window : DEFAULT_FILTER.window,
    /**
     * Capped, because this ends up in a `like` against an indexed column and a
     * ten-kilobyte query string is not a search anybody typed.
     */
    search: (params?.q ?? '').trim().slice(0, 100),
  }
}

/** True when the reader has narrowed anything, so the page can say so. */
export const isFiltered = (filter: BookingFilter): boolean =>
  filter.status !== DEFAULT_FILTER.status ||
  filter.window !== DEFAULT_FILTER.window ||
  filter.search !== ''

/** The query string for a filter, so links can be built without string juggling. */
export function bookingFilterQuery(filter: BookingFilter): string {
  const parts: string[] = []
  if (filter.status !== 'all') parts.push(`status=${encodeURIComponent(filter.status)}`)
  if (filter.window !== DEFAULT_FILTER.window) parts.push(`window=${filter.window}`)
  if (filter.search) parts.push(`q=${encodeURIComponent(filter.search)}`)
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

/**
 * The `Where` for a filter.
 *
 * `customerIds` is resolved by the caller, which is the only place that may look
 * at the Customers collection - an owner cannot read it, so a search by guest
 * name has to be turned into ids first and the ids passed in here. Undefined
 * means "no name lookup was done"; an empty array means "looked, found nobody",
 * and those have to behave differently or a search for a name that matches no
 * customer would quietly return every booking instead of none.
 *
 * Nothing in here constrains the query to the owner's own listings. That is
 * deliberate and important: the Bookings collection does it, in the database,
 * from the session. A second copy of that rule living here is a second copy that
 * can be edited by somebody who does not know the first one exists.
 */
export function bookingFilterWhere(
  filter: BookingFilter,
  options: { now?: Date; customerIds?: (string | number)[] } = {},
): Where {
  const now = options.now ?? new Date()
  const and: Where[] = []

  if (filter.status !== 'all') {
    and.push({ status: { equals: filter.status } })
  }

  /**
   * Split on `end`, not `start`, and the difference is a booking in progress. A
   * table that sat down at eight is not in the past at nine, and a venue looking
   * at tonight's list must still see it.
   */
  if (filter.window === 'upcoming') {
    and.push({ end: { greater_than_equal: now.toISOString() } })
  } else if (filter.window === 'past') {
    and.push({ end: { less_than: now.toISOString() } })
  }

  if (filter.search) {
    const byReference: Where = { reference: { like: filter.search } }

    and.push(
      options.customerIds && options.customerIds.length > 0
        ? { or: [byReference, { customer: { in: options.customerIds } }] }
        : byReference,
    )
  }

  if (and.length === 0) return {}
  if (and.length === 1) return and[0] as Where
  return { and }
}
