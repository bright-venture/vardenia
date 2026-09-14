/**
 * The pre-launch gate: while it is on, the public sees only the coming-soon
 * splash, and a secret link lets the team preview the real site.
 *
 * # Why the logic lives here and not in the middleware
 *
 * The middleware is where the request is, but the decision is a small piece of
 * pure reasoning with several corners - a configured token or not, the query
 * link, the cookie a granted preview leaves behind - and those are the corners
 * that get a rule subtly wrong. Kept as a pure function, they are unit tested
 * without standing up a request. The middleware only reads cookies and env and
 * acts on the answer. See coming-soon.test.ts.
 *
 * # An env flag, not a code change
 *
 * `COMING_SOON` is read at request time in the middleware, so the whole gate is
 * turned on and off with one environment variable rather than a deploy of
 * different code. Merge it once; control it from Netlify forever. It fails
 * closed the safe way round: anything but the exact string `true` is off, so a
 * typo leaves the site open rather than dark, matching NEXT_PUBLIC_ALLOW_INDEX.
 *
 * # The preview link carries no power
 *
 * The token gates a splash screen, nothing more. It is not a login and grants
 * no access to data - every real check in the app still runs against the
 * Payload session. The worst a leaked token does is show someone the site a few
 * days early. It is kept out of the URL bar all the same (see the redirect in
 * the middleware), because a secret in an address bar ends up in history, logs
 * and screenshots.
 */

/** The cookie a granted preview leaves behind. Read by the middleware only. */
export const COMING_SOON_COOKIE = 'vd_preview'

/** `?preview=<token>` unlocks the site and drops the cookie. */
export const PREVIEW_QUERY = 'preview'

/** Where the middleware rewrites gated requests. Its own route renders it. */
export const COMING_SOON_PATH = '/coming-soon'

/** How long a preview lasts before the team has to use the link again. */
export const PREVIEW_MAX_AGE = 60 * 60 * 24 * 30

export interface ComingSoonConfig {
  enabled: boolean
  /** The preview secret, or undefined when none is set (then nobody previews). */
  token: string | undefined
}

/**
 * Read the gate's configuration from the environment.
 *
 * Only the exact value `true` enables it; an empty or unset token means there is
 * no preview link at all, and while the gate is on everyone sees the splash.
 */
export function comingSoonConfig(
  env: Record<string, string | undefined> = process.env,
): ComingSoonConfig {
  const token = env.COMING_SOON_PREVIEW_TOKEN
  return {
    enabled: env.COMING_SOON === 'true',
    token: token && token.length > 0 ? token : undefined,
  }
}

/**
 * What the middleware should do with this request.
 *
 * - `pass`  serve the site as normal (gate off, or a valid preview is held)
 * - `grant` set the preview cookie and bounce to the clean URL
 * - `gate`  rewrite to the coming-soon splash
 */
export type ComingSoonDecision = 'pass' | 'grant' | 'gate'

export function comingSoonDecision(input: {
  enabled: boolean
  token: string | undefined
  queryToken: string | null
  cookieToken: string | undefined
}): ComingSoonDecision {
  if (!input.enabled) return 'pass'

  // With no token configured there is no way in, so the query and cookie cannot
  // unlock anything and every visitor is gated.
  if (input.token) {
    // A fresh link takes priority: it re-grants even to a browser whose cookie
    // was cleared, and refreshes the one that is about to lapse.
    if (input.queryToken === input.token) return 'grant'
    if (input.cookieToken === input.token) return 'pass'
  }

  return 'gate'
}
