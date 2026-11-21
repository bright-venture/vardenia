/**
 * Google Maps links: which ones a listing may store, and the point they carry.
 *
 * One pure module for the server (the `mapUrl` field validation and the hook
 * that fills `location`), the partner guard and the branch endpoint, so they
 * can never disagree about what a link means. The admin's paste box
 * (components/admin/MapsLinkField) keeps its own parser, web lib/maps-paste,
 * as it was before Task 4, and refuses a point outside Lebanon with the same
 * isWithinLebanon. Nothing here touches the network: a short link is
 * recognised and kept as it is, never opened.
 *
 * # Which links are accepted
 *
 * https only, no credentials, no port, and the host must be exactly one of
 * these (case aside). No other subdomain is accepted: sites.google.com and
 * drive.google.com host pages anybody can publish.
 *
 *   google.com, www.google.com   path /maps...
 *   maps.google.com              path /, /maps...   (never /url, a redirect)
 *   goo.gl                       path /maps...      (short link)
 *   maps.app.goo.gl              any path           (short link)
 *
 * # Where the point comes from
 *
 *   .../place/Name/@33.89,35.50,17z/data=...!3d33.8938!4d35.5018   the pin itself
 *   .../@33.89,35.50,17z                                            the map centre
 *   ...?q=33.89,35.50   ?query=   ?ll=   /search/33.89,35.50        a shared point
 *   33.8938, 35.5018                                                copied numbers
 *
 * The pin (!3d/!4d) wins over the centre (@): a place link is centred on the
 * map view, which can be a street away from the place. parseMapsLink itself
 * reads any latitude (-90..90) and longitude (-180..180).
 *
 * # Lebanon is the one rule for a point
 *
 * A point a listing stores must lie within Lebanon, by isWithinLebanon in
 * ./regions (Task 4b, restoring the rule the listing field had before Task 4).
 * isValidPoint applies it, and mapsUrlProblem refuses a link whose coordinates
 * fall outside it, so the listing field, the partner guard, the branch endpoint
 * and the hook that fills `location` from `mapUrl` all agree. A link with no
 * coordinates (a short link, a place name) is not judged: it names no point.
 */

import { isWithinLebanon } from './regions'

export type MapsLinkResult =
  { ok: true; lat: number; lng: number } | { ok: false; reason: 'short-link' | 'no-coordinates' }

const NUMBER = '(-?\\d{1,3}(?:\\.\\d+)?)'
/** The value stops after the second number, so `?q=12,34 Main St` is an address, not a point. */
const END = '(?=$|[?&#/])'
const COMMA = '(?:,|%2C)[+\\s]*'

const PATTERNS: RegExp[] = [
  new RegExp(`!3d${NUMBER}!4d${NUMBER}`),
  new RegExp(`@${NUMBER},${NUMBER}`),
  new RegExp(`[?&](?:q|query|ll|destination|center)=${NUMBER}${COMMA}${NUMBER}${END}`, 'i'),
  new RegExp(`/search/${NUMBER}${COMMA}${NUMBER}${END}`),
  new RegExp(`^\\s*${NUMBER}\\s*,\\s*${NUMBER}\\s*$`),
]

const inRange = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

const SHORT_LINK = /^(https?:\/\/)?(maps\.app\.goo\.gl\/|goo\.gl\/maps(\/|\?|$))/i

export function parseMapsLink(input: string): MapsLinkResult {
  const text = input.trim()
  if (SHORT_LINK.test(text)) return { ok: false, reason: 'short-link' }

  for (const pattern of PATTERNS) {
    const match = text.match(pattern)
    if (!match) continue
    const lat = Number(match[1])
    const lng = Number(match[2])
    if (inRange(lat, lng)) return { ok: true, lat, lng }
  }
  return { ok: false, reason: 'no-coordinates' }
}

const MAX_LENGTH = 2000

/** Shown on the link box; the same words as the admin's paste box (MapsLinkField). */
export const OUTSIDE_LEBANON_LINK = 'That link points outside Lebanon. Check it is the right place.'

/**
 * Whether a normalised host and path are one of the accepted Google Maps
 * places. Exact hosts only: `sites.google.com` and `drive.google.com` serve
 * content anybody can publish, and a subdomain of a short-link host is not the
 * short-link service.
 */
function onMapsHost(host: string, path: string): boolean {
  const under = (base: string) => path === base || path.startsWith(`${base}/`)
  switch (host) {
    case 'google.com':
    case 'www.google.com':
    case 'goo.gl':
      return under('/maps')
    case 'maps.google.com':
      // The map itself. Not /url, which redirects anywhere.
      return path === '/' || under('/maps')
    case 'maps.app.goo.gl':
      return true
    default:
      return false
  }
}

/**
 * Why this is not an acceptable map link, or null when it is.
 * The message is shown to the person editing, so it says what to do.
 */
export function mapsUrlProblem(value: string): string | null {
  const text = value.trim()
  const fail =
    'Paste a Google Maps link (https://www.google.com/maps/..., or a maps.app.goo.gl short link).'
  if (text.length === 0 || text.length > MAX_LENGTH) return fail
  // Whitespace, control characters and backslashes are how a URL is made to
  // read one way to a person and another way to a browser.
  if (/[\s\u0000-\u001f\u007f\\]/.test(text)) return fail
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return fail
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return fail
  if (!onMapsHost(url.hostname.toLowerCase(), url.pathname.toLowerCase())) return fail
  // The one rule for a point: a link that names coordinates outside Lebanon is
  // refused here, so its point is never written to `location`.
  const parsed = parseMapsLink(text)
  if (parsed.ok && !isWithinLebanon(parsed.lat, parsed.lng)) return OUTSIDE_LEBANON_LINK
  return null
}

/**
 * The point a valid link names, as Payload stores it: [longitude, latitude].
 * Null for a refused link (including one pointing outside Lebanon), a short
 * link, or a link with no coordinates, in which case the listing's location is
 * left as it is.
 */
export function pointFromMapsUrl(value: string): [number, number] | null {
  if (mapsUrlProblem(value) !== null) return null
  const result = parseMapsLink(value)
  return result.ok ? [result.lng, result.lat] : null
}

/**
 * A point as Payload stores it: [longitude, latitude], two finite numbers (a
 * numeric string is what a form posts) that lie within Lebanon
 * (isWithinLebanon). The one check for a stored point.
 */
export function isValidPoint(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 2) return false
  const [lng, lat] = value.map((part) =>
    typeof part === 'number'
      ? part
      : typeof part === 'string' && part.trim() !== ''
        ? Number(part)
        : NaN,
  )
  return Number.isFinite(lng) && Number.isFinite(lat) && isWithinLebanon(lat!, lng!)
}
