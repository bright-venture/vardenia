import { APIError, type CollectionBeforeValidateHook, type Payload } from 'payload'
import { OCCUPYING_STATUSES } from '@vardenia/core'
import { isStaffUser, ownedBusinessIds } from '../access/index'
import { isCalendarDay, occupiedDays } from '../lib/availability'
import { addDays, beirutInstant } from '../lib/beirut'

/**
 * The rules a closure has to satisfy, wherever it is written from.
 *
 * A `beforeValidate` hook rather than checks in the dashboard, for the same
 * reason `guardBookingWrite` is one: this runs for the admin panel, for the REST
 * API and for anything written later, and an invariant enforced only in a form
 * is an invariant that holds until the first person uses the API.
 *
 * # The ownership check is the load-bearing part
 *
 * Payload's `create` access function is a boolean and never sees the document,
 * so the collection can answer "may this account create a closure" and cannot
 * answer "for which business". Without this hook a partner could POST a closure
 * naming somebody else's listing and shut a competitor for August. Read, update
 * and delete are all constrained by a `Where` in the collection; create is the
 * one operation that has nowhere to put one.
 */

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

export const guardClosureWrite: CollectionBeforeValidateHook = async ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  if (!data) return data

  const { user } = req
  const staff = isStaffUser(user)

  /**
   * A closure cannot be moved to a different listing, and this is checked before
   * ownership rather than after.
   *
   * Both orders refuse an owner repointing their closure at a stranger's
   * restaurant - the ownership check below catches it too - but they refuse it
   * with different sentences, and only this one is true. A closure belongs to one
   * listing, so repointing it at another listing the same owner *does* manage is
   * equally wrong, and "you can only close your own listings" would be a baffling
   * thing to read while closing your own listing. A change of business is a new
   * closure.
   */
  if (operation === 'update' && originalDoc && data.business !== undefined) {
    if (idOf(data.business) !== idOf(originalDoc.business)) {
      throw new APIError('A closure cannot be moved to a different business.', 400)
    }
  }

  const businessId = idOf(data.business ?? originalDoc?.business)
  if (businessId === null) {
    throw new APIError('A closure has to name a business.', 400)
  }

  /**
   * Staff write closures for anybody - they enter them from a phone call. An
   * owner writes them only for listings attached to their own account, and the
   * list comes off `req.user`, which Payload has already loaded, so the check
   * costs no round trip.
   */
  if (!staff) {
    const owned = ownedBusinessIds(user).map(String)
    if (!owned.includes(String(businessId))) {
      throw new APIError('You can only set closed dates for your own listings.', 403)
    }
  }

  const startsOn = data.startsOn ?? originalDoc?.startsOn
  const endsOn = data.endsOn ?? originalDoc?.endsOn

  if (!isCalendarDay(startsOn) || !isCalendarDay(endsOn)) {
    throw new APIError('Dates must be real days, written as YYYY-MM-DD.', 400)
  }

  /**
   * Compared as strings, which is exactly right for this format: `2026-08-09`
   * sorts before `2026-08-14` character by character, and no timezone is
   * involved. A backwards range is refused rather than quietly swapped - a
   * venue that typed the dates the wrong way round should see that, not be
   * silently corrected into closing a week they meant to stay open.
   */
  if (endsOn < startsOn) {
    throw new APIError('The last day cannot be before the first.', 400)
  }

  /**
   * Not over bookings that are still on.
   *
   * A closure stops new bookings and used to leave existing ones alone, with a
   * note asking the venue to deal with them. Guests who had booked were not
   * told, and turned up to a closed door. So the dates are refused while any
   * pending or confirmed booking falls on them, and the venue is shown which.
   * Declining or cancelling each one emails the guest, and then the closure
   * saves. Checked only when the dates are new or have moved, so a closure can
   * still have its note edited.
   */
  const datesChanged =
    operation !== 'update' || startsOn !== originalDoc?.startsOn || endsOn !== originalDoc?.endsOn
  if (datesChanged) {
    const affected = await bookingsOnDays(req.payload, businessId, startsOn, endsOn)
    if (affected.length > 0) throw new APIError(bookingsInTheWay(affected), 409)
  }

  return data
}

interface LiveBooking {
  reference: string
  start: Date
  end: Date
  partySize: number
}

/**
 * Pending and confirmed bookings, not yet over, that occupy any day from
 * `startsOn` to `endsOn`. "Occupy" is the availability engine's own rule
 * (`occupiedDays`), so a stay whose nights cross into the closure counts, the
 * same way the closure would refuse that stay if it were booked now.
 */
export async function bookingsOnDays(
  payload: Payload,
  businessId: string | number,
  startsOn: string,
  endsOn: string,
  now: Date = new Date(),
): Promise<LiveBooking[]> {
  // A wide net by instant, then the exact day rule below.
  const from = beirutInstant(addDays(startsOn, -1), '00:00')
  const to = beirutInstant(addDays(endsOn, 2), '00:00')
  if (!from || !to) return []

  const found = await payload.find({
    collection: 'bookings',
    where: {
      and: [
        { business: { equals: businessId } },
        { status: { in: [...OCCUPYING_STATUSES] } },
        { end: { greater_than: now.toISOString() } },
        { start: { less_than: to.toISOString() } },
        { end: { greater_than: from.toISOString() } },
      ],
    },
    sort: 'start',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  return found.docs.flatMap((doc) => {
    const start = new Date(String((doc as { start?: unknown }).start))
    const end = new Date(String((doc as { end?: unknown }).end))
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
    const [firstDay, lastDay] = occupiedDays(start, end)
    if (!(firstDay <= endsOn && lastDay >= startsOn)) return []
    return [
      {
        reference: String((doc as { reference?: unknown }).reference ?? ''),
        start,
        end,
        partySize: Number((doc as { partySize?: unknown }).partySize ?? 1),
      },
    ]
  })
}

const WHEN = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Beirut',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** The sentence the venue reads: which bookings, and what to do about them. */
export function bookingsInTheWay(affected: LiveBooking[]): string {
  const shown = affected.slice(0, 5).map((booking) => {
    const people = `${booking.partySize} ${booking.partySize === 1 ? 'person' : 'people'}`
    return `${booking.reference} (${WHEN.format(booking.start)}, ${people})`
  })
  const more = affected.length - shown.length
  const count =
    affected.length === 1 ? 'There is 1 booking' : `There are ${affected.length} bookings`
  return (
    `${count} on these dates: ${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}. ` +
    'Decline or cancel them first - each guest is told by email - then add the closed dates.'
  )
}
