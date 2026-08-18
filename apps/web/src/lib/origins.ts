/**
 * Which origins may talk to this Payload instance.
 *
 * Two settings read this list and they answer different questions:
 *
 *  - `cors` decides whose browser may read a cross-origin response.
 *  - `csrf` decides whose page may make a request that carries our auth cookie.
 *
 * The second is the one that started mattering when logins arrived. Payload
 * authenticates with a cookie, and a cookie is attached by the browser to any
 * request at our domain no matter which page triggered it. Without a CSRF list,
 * a page on an unrelated site can make an authenticated request as whoever is
 * logged in - and until this project had accounts, that was a theoretical
 * concern about a staff-only panel. It now covers customers and business owners.
 *
 * # Exact matching, and why the normalising matters
 *
 * An origin is scheme + host + port and nothing else. Payload compares the
 * request's `Origin` header against these strings literally, so
 * `https://vardenia.com/` with a trailing slash never matches the header
 * `https://vardenia.com`, and the failure is a request refused for reasons that
 * look nothing like a configuration typo. NEXT_PUBLIC_SITE_URL is written by
 * hand into a hosting dashboard, so it will eventually arrive with a slash.
 */

/** Scheme + host + port, or null for anything unusable. */
export function toOrigin(value: string | null | undefined): string | null {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  return url.origin
}

/**
 * The apex/www counterpart of an origin, or null when there isn't a sensible one.
 *
 * `www.vardenia.com` redirects to the apex at the CDN, so in the ordinary case a
 * request never originates there. It does when someone lands on the www address
 * and the page issues a request before the redirect has settled, and the symptom
 * is a login that fails for one person and nobody else. Cheap to allow, awkward
 * to diagnose.
 *
 * Only applied to plain `host.tld` and `www.host.tld`. Anything deeper - a
 * preview subdomain, a staging host - is left alone rather than guessed at.
 */
export function counterpartOrigin(origin: string): string | null {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return null
  }

  const host = url.hostname

  if (host.startsWith('www.')) {
    const bare = host.slice(4)
    if (bare.split('.').length !== 2) return null
    url.hostname = bare
    return url.origin
  }

  if (host.split('.').length !== 2) return null
  url.hostname = `www.${host}`
  return url.origin
}

/**
 * Every origin allowed to reach this instance.
 *
 * Built from the canonical site URL rather than listed by hand, so it follows
 * the domain automatically instead of being a second place to remember. Extra
 * origins - the netlify.app address while it is still in use, a staging host -
 * come from PAYLOAD_EXTRA_ORIGINS as a comma-separated list.
 *
 * Never returns `'*'`. Payload accepts it and it is the wrong answer here: with
 * credentials in play a wildcard means any site may act as a logged-in user.
 * An empty result would be safer still but would lock out the admin panel, so
 * localhost is the floor - which is also what a developer with no environment
 * set actually needs.
 */
export function allowedOrigins(
  siteUrl: string | null | undefined = process.env.NEXT_PUBLIC_SITE_URL,
  extra: string | null | undefined = process.env.PAYLOAD_EXTRA_ORIGINS,
): string[] {
  const origins = new Set<string>()

  const site = toOrigin(siteUrl)
  if (site) {
    origins.add(site)
    const counterpart = counterpartOrigin(site)
    if (counterpart) origins.add(counterpart)
  }

  for (const candidate of (extra ?? '').split(',')) {
    const origin = toOrigin(candidate)
    if (origin) origins.add(origin)
  }

  // A build with nothing configured still has to serve its own admin panel.
  if (origins.size === 0) origins.add('http://localhost:3000')

  return [...origins]
}
