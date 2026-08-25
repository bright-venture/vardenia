/**
 * A marker saying "somebody is signed in", readable by the browser.
 *
 * # The problem it solves
 *
 * The header used to say "Your account" whether or not anybody was signed in,
 * because the alternative looked impossible: showing "Sign in" to a visitor and
 * "Your account" to a customer means knowing which one is reading, and reading
 * the session on the server means `headers()`, which opts every prerendered page
 * out of static rendering. Measured earlier in this project, that is the
 * difference between a 6ms page and a 350ms one, on every page, for one word.
 *
 * # Why a second cookie
 *
 * Payload's `payload-token` is httpOnly, correctly, so no script can see it.
 * This carries no identity, no token and no claim - only the fact that a session
 * exists - so it is safe to let the browser read, and the header can swap its
 * own label without the server rendering anything.
 *
 * Nothing is authorised on the strength of it. Every real check still happens
 * against the httpOnly token. The worst a forged value does is show its own
 * author the wrong link, which the page they land on then corrects.
 *
 * # It says which kind of session, not just that there is one
 *
 * It used to hold `1` and mean "somebody is signed in". That was wrong, because
 * Payload mints the same `payload-token` cookie for every auth collection -
 * staff, partners and customers alike. So signing in to `/admin` as staff set
 * the hint, and the public header offered "Your account" to somebody who has no
 * customer account at all. Following it led to `/account`, which correctly told
 * them to sign in. Header and page contradicting each other, again.
 *
 * The audience is therefore part of the value. Staff get no hint: they are not
 * customers, and their home is the admin panel.
 *
 * # It drifts, and the middleware corrects it
 *
 * A token expiring does not clear this, because nothing in the browser is told
 * that it happened. This file used to claim that was survivable on the grounds
 * that the page the reader lands on corrects them. It does not: the header is on
 * that page too, so `/account` showed "Your account" at the top and "Sign in to
 * see your bookings" underneath it, at the same time.
 *
 * The correction lives in middleware, which is the only place that can see both
 * this cookie and the httpOnly token in the same request. It writes and clears
 * in both directions, so the drift lasts exactly one request - including for a
 * browser still carrying the old `1`, which no longer reads as any audience and
 * is replaced or removed on the next request.
 */

export const SESSION_HINT = 'vd_session'

/** Who the session belongs to, as far as the header needs to care. */
export type SessionAudience = 'customer' | 'partner'

/**
 * Single letters because the whole cookie is a hint.
 *
 * Spelling out `customer` would say a little more about the reader to anything
 * that happens to see the request, for no gain - nothing but this file and the
 * middleware ever interprets it.
 */
export const HINT_VALUE: Record<SessionAudience, string> = {
  customer: 'c',
  partner: 'p',
}

const AUDIENCE_FOR: Record<string, SessionAudience> = {
  c: 'customer',
  p: 'partner',
}

/** A week, matching the token's own lifetime, so the two lapse together. */
const MAX_AGE = 60 * 60 * 24 * 7

const attributes = () => {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:'
  return `path=/; samesite=lax${secure ? '; secure' : ''}`
}

/** Called wherever a session is created: sign in, sign up, password reset. */
export function markSignedIn(audience: SessionAudience): void {
  if (typeof document === 'undefined') return
  document.cookie = `${SESSION_HINT}=${HINT_VALUE[audience]}; max-age=${MAX_AGE}; ${attributes()}`
}

/** Called wherever a session ends: sign out, closing an account. */
export function markSignedOut(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${SESSION_HINT}=; max-age=0; ${attributes()}`
}

/**
 * Which audience the hint claims, or null for none.
 *
 * Anything unrecognised is null, which covers a tampered value and the old `1`
 * equally. Null means the header shows its signed-out links - the safe reading,
 * because it offers a way in rather than a way back to something that may not
 * be there.
 */
export function sessionAudience(): SessionAudience | null {
  if (typeof document === 'undefined') return null

  for (const pair of document.cookie.split('; ')) {
    const [name, value] = pair.split('=')
    if (name === SESSION_HINT) return AUDIENCE_FOR[value ?? ''] ?? null
  }

  return null
}
