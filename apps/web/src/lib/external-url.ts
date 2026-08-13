/**
 * What counts as a usable destination for a QR code pointing off-site.
 *
 * This exists because `Response.redirect()` throws on anything that is not an
 * absolute URL, and a throw inside the scan route is a 500. The route's own
 * contract is that a printed code must never dead-end, and a 500 is a worse
 * dead end than a 404.
 *
 * The input that triggers it is not exotic. `vardenia.com` - a domain typed the
 * way every human types one - has no scheme, so it throws. So does an empty
 * string, and so does anything with a stray space.
 *
 * One module, used by both the field validation and the redirect, so the rule
 * that decides what saves is the same rule that decides what resolves.
 */

/** Only real web addresses. `javascript:`, `data:` and `file:` are not destinations. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Returns a browser-usable absolute URL, or null.
 *
 * A bare host gets `https://` rather than being rejected: typing `vardenia.com`
 * is the normal way to write a domain, and refusing it teaches editors that the
 * field is fussy rather than that they made a mistake. Anything genuinely
 * unusable still returns null.
 */
export function normalizeExternalUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null

  const trimmed = input.trim()
  if (!trimmed) return null

  // A scheme we do not allow must be rejected, never quietly re-prefixed:
  // turning `javascript:alert(1)` into `https://javascript:alert(1)` would hide
  // the problem instead of surfacing it.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  const candidate = hasScheme ? trimmed : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null

  // `https://` alone parses but has no host to reach.
  if (!url.hostname) return null

  // A hostname with no dot is either a typo or an internal name that will not
  // resolve for a reader standing in a hotel lobby. `localhost` included.
  if (!url.hostname.includes('.')) return null

  return url.toString()
}

/** True when this value can safely be handed to `Response.redirect`. */
export function isUsableExternalUrl(input: unknown): boolean {
  return normalizeExternalUrl(input) !== null
}
