import type { Payload } from 'payload'

/**
 * Whether new customer accounts are paused, from the admin's Settings page
 * (globals/Settings, Accounts tab).
 *
 * Added on 6 November 2026 so the owner can stop new sign-ups for a while
 * without a deploy. While paused, /auth/signup refuses every request and the
 * sign-up page shows a note instead of the form. Nothing else changes: people
 * with an account still sign in, book, and reset a forgotten password, which
 * is a separate endpoint and stays open.
 *
 * Read with access overridden, because the people it applies to are signed
 * out. A setting that cannot be read counts as open: a database hiccup should
 * not quietly turn sign-up off, and the rate limit and the human check still
 * stand in front of it.
 */
export async function signupsPaused(payload: Payload): Promise<boolean> {
  const settings = (await payload
    .findGlobal({ slug: 'settings', depth: 0, overrideAccess: true })
    .catch(() => null)) as { signupsPaused?: boolean | null } | null
  return settings?.signupsPaused === true
}

/** The answer /auth/signup gives while paused, and the code the form looks for. */
export const SIGNUPS_PAUSED_CODE = 'signups-paused'
