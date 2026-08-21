/**
 * Getting a signed-in customer out of the admin panel's dead end.
 *
 * Payload issues one cookie name for every auth collection, so a customer's
 * `payload-token` is presented to `/admin` and validates - it simply is not a
 * token for the collection `admin.user` is bound to. Payload renders
 * "Unauthorized, this user does not have access to the admin panel", with a Log
 * out button.
 *
 * That button does not work, and the reason is already written down in
 * SignOutButton: Payload's logout endpoint is per collection, and posting to the
 * wrong one succeeds without clearing anything. The admin panel posts to the
 * staff collection. The cookie is a customer's. Nothing is cleared, the page
 * reloads, and the reader is back where they started with no way out except
 * clearing cookies by hand.
 *
 * So they are sent somewhere useful before Payload ever renders: their own
 * account page, still signed in, where the sign-out button posts to the right
 * collection.
 *
 * # Read, not verified, and that is fine
 *
 * The claim is decoded without checking the signature, because middleware runs
 * on the edge and the signing secret is not there. Nothing is granted on the
 * strength of it - the only outcome is a redirect *away* from a page, so the
 * worst a forged token can do is send its own author to the account page. Every
 * real authorisation still happens inside Payload with the signature checked.
 *
 * The safe direction is therefore "leave it alone": anything unreadable, absent
 * or staff-shaped passes through untouched, and Payload decides as it always
 * has. A middleware that guesses wrong about the admin panel takes down the
 * whole back office.
 */

/** The cookie Payload mints for every auth collection. */
export const PAYLOAD_COOKIE = 'payload-token'

/** Where each kind of account is sent instead of the admin panel. */
const HOME_FOR: Record<string, string> = {
  customers: '/account',
  'business-users': '/partner',
}

/**
 * The collection a token was minted against, or null if that cannot be read.
 *
 * Null covers every failure the same way - no token, wrong shape, invalid
 * base64, not JSON, no `collection` claim - because every one of them means the
 * same thing here: do nothing and let Payload answer.
 */
export function tokenCollection(token: string | undefined | null): string | null {
  if (!token) return null

  const segments = token.split('.')
  if (segments.length !== 3) return null

  try {
    const payload = segments[1] as string
    // base64url to base64, then pad to a multiple of four.
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')

    const claims = JSON.parse(atob(padded)) as { collection?: unknown }
    return typeof claims.collection === 'string' ? claims.collection : null
  } catch {
    return null
  }
}

/**
 * Where to send this request instead of the admin panel, or null to let it pass.
 *
 * Staff pass through. So does anybody with no token at all - Payload's own login
 * screen is the right answer there, and intercepting it would mean building a
 * second one.
 */
export function adminRedirectFor(token: string | undefined | null): string | null {
  const collection = tokenCollection(token)
  if (collection === null || collection === 'users') return null

  /**
   * An unrecognised collection still gets moved along. A new auth collection
   * added later would otherwise inherit the dead end by default, and the account
   * page is a harmless place to land.
   */
  return HOME_FOR[collection] ?? '/account'
}
