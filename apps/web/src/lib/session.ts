import { isTerminalStatus, type BookingStatus } from '@vardenia/core'
import { cache } from 'react'
import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import config from '../payload.config'
import { BUSINESS_USER_COLLECTION, CUSTOMER_COLLECTION, ownedBusinessIds } from '../access/index'
import { bookingFilterWhere, DEFAULT_FILTER, type BookingFilter } from './booking-filters'
import type { Booking } from '../payload-types'

/**
 * Who is signed in, as far as the public site is concerned.
 *
 * Payload issues one cookie for every auth collection - staff, business owners
 * and customers all arrive as `payload-token` - so the collection has to be
 * checked rather than the presence of a user. `payload.auth` reports which
 * collection the token was minted against, and anything other than `customers`
 * is not a customer here. A staff member browsing the public site while signed
 * into the admin is a real case, not a contrived one, and they must not be shown
 * somebody's account page because their cookie happened to validate.
 *
 * That shared cookie name has a consequence worth knowing before it surprises
 * somebody: signing in as a customer in the same browser replaces the admin
 * session. It is a nuisance for us and invisible to everyone else, which is why
 * it is a note rather than a `cookiePrefix` change - renaming the cookie signs
 * out every existing session, including the ones on the live site.
 *
 * Wrapped in `cache()` so a page and its layout do not each pay for the token
 * check. Per-request only; nothing survives to the next request.
 *
 * # A valid cookie is not always enough, and the reason is our own CSRF list
 *
 * Payload only accepts a token from a cookie after a CSRF check
 * (`auth/extractJWT.js`). With `csrf` configured - which it is, see lib/origins -
 * the request must carry either an `Origin` header on the allowlist, or a
 * `Sec-Fetch-Site` of `same-origin`, `same-site` or `none`. A request with
 * neither is refused, and refused silently: `auth` returns a null user exactly
 * as it would for an expired token, so a signed-in customer sees the signed-out
 * page with a perfectly good cookie in their browser.
 *
 * Every current browser sends `Sec-Fetch-Site` on a top-level navigation, so
 * this works. Two things to know when it appears not to:
 *
 *  - Safari only shipped Fetch Metadata in 16.4. Anyone older cannot hold a
 *    session on a server-rendered page here, and there is nothing they can do
 *    about it from their end.
 *  - Locally, the allowlist is built from NEXT_PUBLIC_SITE_URL. Serving the app
 *    on any other port makes every `fetch` from our own pages cross-origin as
 *    far as Payload is concerned, and sign-out stops working with no error.
 *    Found the hard way on port 3002; PAYLOAD_EXTRA_ORIGINS is the fix.
 */

export interface CustomerSession {
  id: number
  email: string
  name: string
  /** False until they have followed the link in the verification email. */
  verified: boolean
}

export const currentCustomer = cache(async (): Promise<CustomerSession | null> => {
  const payload = await getPayload({ config })

  /**
   * Failures are swallowed to null rather than thrown.
   *
   * An expired or malformed token is the ordinary case - a cookie from before a
   * deploy, a session left open over a weekend - and the honest answer to "who
   * is this" is "nobody". Letting it throw turns every stale cookie into a 500
   * on a page that should simply have offered a sign-in link.
   */
  const auth = await payload
    .auth({ headers: await nextHeaders() })
    .catch(() => ({ user: null }) as { user: null })

  const user = auth.user
  if (!user || user.collection !== CUSTOMER_COLLECTION) return null

  return {
    id: Number(user.id),
    email: String(user.email ?? ''),
    name: String((user as { name?: unknown }).name ?? ''),
    verified: (user as { _verified?: unknown })._verified === true,
  }
})

/**
 * The bookings belonging to the signed-in customer.
 *
 * Run with `overrideAccess: false` and the customer's own `user`, so the
 * `{ customer: { equals: user.id } }` constraint on the Bookings collection does
 * the filtering in the database. Passing the id as a `where` clause here instead
 * would work today and would be one refactor away from a page that lists
 * everybody's bookings - the constraint has to be the collection's, not this
 * file's.
 */
export async function customerBookings(limit = 50) {
  const payload = await getPayload({ config })

  const auth = await payload
    .auth({ headers: await nextHeaders() })
    .catch(() => ({ user: null }) as { user: null })

  const user = auth.user
  if (!user || user.collection !== CUSTOMER_COLLECTION) return []

  const result = await payload.find({
    collection: 'bookings',
    // Resolves the business so the page can show a name rather than an id.
    depth: 1,
    limit,
    sort: '-start',
    overrideAccess: false,
    user,
  })

  return result.docs
}

/**
 * Bookings split into what is still ahead and what is behind.
 *
 * Split on the *end* rather than the start, so a dinner that began an hour ago
 * is still "upcoming" while you are sitting at the table. Splitting on the start
 * files a booking under Past at the exact moment it matters most.
 *
 * A separate function taking an explicit `now` for two reasons. It makes that
 * rule testable without a clock, and it keeps `Date.now()` out of a component
 * body - `react-hooks/purity` rejects an impure call during render, and it is
 * right to: a value that changes between renders belongs to the data layer.
 * That rule fires in Next's build lint and not in ours, which is how it reached
 * CI; see eslint.config.mjs.
 */
export function partitionBookings<T extends { end: string; status?: string | null }>(
  bookings: T[],
  now: number = Date.now(),
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = []
  const past: T[] = []

  for (const booking of bookings) {
    /**
     * Status first, then the clock.
     *
     * This used to split on the end date alone, which put a booking marked
     * completed, cancelled or no-show under "Upcoming" whenever its date had
     * not passed yet. That is exactly what a reader saw: a card reading
     * COMPLETED, filed under Upcoming, on the same screen. Nothing is upcoming
     * once it has been settled, whatever the calendar says - and an owner can
     * legitimately mark a table done before the slot ends, or cancel one weeks
     * ahead.
     */
    if (booking.status && isTerminalStatus(booking.status as BookingStatus)) {
      past.push(booking)
      continue
    }

    const end = new Date(booking.end).getTime()
    // An unparseable date is shown rather than dropped. A booking that vanishes
    // from somebody's account is worse than one filed under the wrong heading.
    if (Number.isNaN(end) || end >= now) upcoming.push(booking)
    else past.push(booking)
  }

  return { upcoming, past }
}

/**
 * The signed-in business owner, if there is one.
 *
 * Same shape as `currentCustomer` and separate for the same reason: Payload
 * issues one cookie name for every auth collection, so the collection has to be
 * checked rather than the presence of a user. A customer's token validates
 * perfectly well; it just does not belong to somebody who manages a listing.
 *
 * Owners cannot reach the admin panel at all - `admin.user` is bound to `users`
 * - which is why they need pages of their own rather than a role on a screen
 * that already exists.
 */
export interface OwnerSession {
  id: number
  email: string
  name: string
  /** The listings this account manages. Staff-assigned; see BusinessUsers. */
  businessIds: (string | number)[]
}

export const currentOwner = cache(async (): Promise<OwnerSession | null> => {
  const payload = await getPayload({ config })

  const auth = await payload
    .auth({ headers: await nextHeaders() })
    .catch(() => ({ user: null }) as { user: null })

  const user = auth.user
  if (!user || user.collection !== BUSINESS_USER_COLLECTION) return null

  return {
    id: Number(user.id),
    email: String(user.email ?? ''),
    name: String((user as { name?: unknown }).name ?? ''),
    businessIds: ownedBusinessIds(user),
  }
})

/**
 * The bookings this owner may see.
 *
 * `overrideAccess: false` with the owner's own `user`, so the constraint comes
 * from the Bookings collection - `{ business: { in: ownedBusinessIds(user) } }`
 * - and is applied in the database. Writing the filter here instead would work
 * today and would be one careless refactor away from a page showing a
 * competitor's reservations.
 *
 * Sorted by start, soonest first: an owner opening this wants tonight, not last
 * March.
 *
 * # The guest's name is fetched separately, and deliberately
 *
 * `depth: 1` does not populate `customer` for an owner, because Customers is
 * `selfOrStaff` and an owner is neither. That is the right rule - a partner has
 * no business reading our customer list - but it left the dashboard showing a
 * booking with nobody's name on it, which is close to useless: "someone, two
 * people, Tuesday". Found by looking at the rendered page.
 *
 * So the name and phone are looked up here with access overridden, and *only*
 * those two fields are put on the row. Not the email, which is the key the whole
 * account system is built on and is not needed to greet somebody at a door; not
 * the record itself. Opening the collection to owners instead would have been
 * the easier change and a much larger grant - and it cannot even be expressed as
 * a Where constraint, since a customer row carries no reference to a booking.
 */
export interface OwnerBookingGuest {
  name: string
  phone: string
}

/**
 * Searching by guest name, without letting an owner read the customer list.
 *
 * The name lives on Customers, which an owner cannot see, so a name search has
 * to become a set of ids first. That lookup runs with access overridden and its
 * result is used only as a filter - the ids go into a bookings query that is
 * still constrained to this owner's own listings by the collection. So a search
 * can never surface a customer who has not booked with them.
 *
 * Returns undefined when there was nothing to look up, which the `Where` builder
 * treats differently from "looked and found nobody".
 */
async function customerIdsMatching(
  payload: Awaited<ReturnType<typeof getPayload>>,
  search: string,
): Promise<(string | number)[] | undefined> {
  if (!search) return undefined

  const found = await payload.find({
    collection: 'customers',
    where: { name: { like: search } },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })

  return found.docs.map((doc) => doc.id)
}

export interface OwnerBookingsResult {
  /**
   * `ended` says whether the sitting is over, which decides which actions the
   * dashboard may honestly offer. Stamped here rather than worked out in the
   * component, for the same reason `partitionBookings` takes an explicit `now`:
   * `react-hooks/purity` refuses a `Date.now()` during render, and it is right
   * to - a value that changes between renders belongs to the data layer. One
   * clock for the whole list, so two bookings a minute apart cannot disagree.
   */
  docs: (Booking & { guest: OwnerBookingGuest | null; ended: boolean })[]
  totalDocs: number
  /** Requests still waiting on an answer, across every filter. */
  awaiting: number
}

export async function ownerBookings(
  filter: BookingFilter = DEFAULT_FILTER,
  limit = 100,
): Promise<OwnerBookingsResult> {
  const empty = { docs: [], totalDocs: 0, awaiting: 0 }
  const payload = await getPayload({ config })

  const auth = await payload
    .auth({ headers: await nextHeaders() })
    .catch(() => ({ user: null }) as { user: null })

  const user = auth.user
  if (!user || user.collection !== BUSINESS_USER_COLLECTION) return empty

  const customerIds = await customerIdsMatching(payload, filter.search)

  const result = await payload.find({
    collection: 'bookings',
    where: bookingFilterWhere(filter, { customerIds }),
    depth: 1,
    limit,
    /**
     * Soonest first when looking ahead, most recent first when looking back.
     * A venue reading its history wants last night at the top, not the oldest
     * booking it ever took.
     */
    sort: filter.window === 'past' ? '-start' : 'start',
    overrideAccess: false,
    user,
  })

  /**
   * Counted separately and deliberately outside the filter.
   *
   * A request waiting for an answer is the one thing on this page that is
   * costing somebody something while it sits there, and it must stay visible
   * while the reader is looking at, say, last month's no-shows. A badge that
   * disappears because of a filter is a badge that stops being trusted.
   */
  const waiting = await payload.find({
    collection: 'bookings',
    where: bookingFilterWhere({ status: 'pending', window: 'upcoming', search: '' }),
    limit: 0,
    depth: 0,
    overrideAccess: false,
    user,
  })

  const now = Date.now()
  const withEnded = (await withGuests(payload, result.docs)).map((doc) => {
    const end = new Date(doc.end).getTime()
    /**
     * An unparseable date counts as not yet ended - the safe direction. The
     * worst case is one fewer button, rather than a no-show recorded against
     * somebody who was never given the chance to arrive.
     */
    return { ...doc, ended: Number.isFinite(end) && end < now }
  })

  return {
    docs: withEnded,
    totalDocs: result.totalDocs,
    awaiting: waiting.totalDocs,
  }
}

/**
 * Puts the guest's name and phone on each booking, and only those two fields.
 *
 * Split out of `ownerBookings` when that grew filters. Unchanged in what it
 * does: `depth: 1` does not populate `customer` for an owner, because Customers
 * is `selfOrStaff` and an owner is neither.
 */
async function withGuests<T extends { customer?: unknown }>(
  payload: Awaited<ReturnType<typeof getPayload>>,
  docs: T[],
): Promise<(T & { guest: OwnerBookingGuest | null })[]> {
  const customerIds = [
    ...new Set(
      docs
        .map((doc) => {
          const value = (doc as { customer?: unknown }).customer
          if (typeof value === 'number' || typeof value === 'string') return value
          return (value as { id?: number | string } | null)?.id ?? null
        })
        .filter((id): id is number | string => id !== null),
    ),
  ]

  const guests = new Map<string, OwnerBookingGuest>()

  if (customerIds.length > 0) {
    const found = await payload.find({
      collection: 'customers',
      where: { id: { in: customerIds } },
      limit: customerIds.length,
      depth: 0,
      overrideAccess: true,
    })

    for (const doc of found.docs) {
      guests.set(String(doc.id), {
        name: String((doc as { name?: unknown }).name ?? ''),
        phone: String((doc as { phone?: unknown }).phone ?? ''),
      })
    }
  }

  return docs.map((doc) => {
    const value = doc.customer
    const id =
      typeof value === 'number' || typeof value === 'string'
        ? value
        : ((value as { id?: number | string } | null)?.id ?? null)

    return { ...doc, guest: id === null ? null : (guests.get(String(id)) ?? null) }
  })
}
