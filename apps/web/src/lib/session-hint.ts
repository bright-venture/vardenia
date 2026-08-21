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
 * # It can drift, and that is survivable
 *
 * A token expiring does not clear this, so a lapsed session still shows "Your
 * account" until the reader clicks it and lands on the sign-in page. That is the
 * same place the honest answer would have sent them, one step later.
 */

export const SESSION_HINT = 'vd_session'

/** A week, matching the token's own lifetime, so the two lapse together. */
const MAX_AGE = 60 * 60 * 24 * 7

const attributes = () => {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:'
  return `path=/; samesite=lax${secure ? '; secure' : ''}`
}

/** Called wherever a session is created: sign in, sign up, password reset. */
export function markSignedIn(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${SESSION_HINT}=1; max-age=${MAX_AGE}; ${attributes()}`
}

/** Called wherever a session ends: sign out, closing an account. */
export function markSignedOut(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${SESSION_HINT}=; max-age=0; ${attributes()}`
}

export function hasSessionHint(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split('; ').some((pair) => pair === `${SESSION_HINT}=1`)
}
