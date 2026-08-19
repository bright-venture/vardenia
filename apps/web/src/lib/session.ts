import { cache } from 'react'
import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import config from '../payload.config'
import { CUSTOMER_COLLECTION } from '../access/index'

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
