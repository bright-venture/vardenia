import { APIError, type CollectionBeforeValidateHook } from 'payload'
import { isStaffUser, ownedBusinessIds } from '../access/index'
import { isCalendarDay } from '../lib/availability'

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

  return data
}
