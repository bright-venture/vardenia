/**
 * Coordinates out of whatever staff copy from Google Maps.
 *
 * The listing's location is two boxes, longitude then latitude, and its note
 * warned about getting the order wrong, which is the mistake two boxes invite:
 * Lebanon's latitude (33 to 34.7) and longitude (35.1 to 36.6) are close enough
 * that a swapped pair still looks like a number. A pasted link carries both in a
 * known order, so nobody types either.
 *
 * Read in the forms Google actually produces, most specific first:
 *
 *   .../place/Name/@33.89,35.50,17z/data=...!3d33.8938!4d35.5018   the pin itself
 *   .../@33.89,35.50,17z                                            the map centre
 *   ...?q=33.89,35.50   ...?query=...   ...?ll=...                   a shared point
 *   33.8938, 35.5018                                                copied numbers
 *
 * The pin (!3d/!4d) wins over the centre (@), because a place link is centred
 * on the map view, which can be a street away from the place.
 *
 * Short links (maps.app.goo.gl, goo.gl/maps) name no coordinates until they are
 * opened, and following one needs a request this cannot make from the page.
 * They are recognised so the answer can say what to do instead.
 */

export type MapsLinkResult =
  { ok: true; lat: number; lng: number } | { ok: false; reason: 'short-link' | 'no-coordinates' }

const NUMBER = '(-?\\d{1,3}(?:\\.\\d+)?)'

const PATTERNS: RegExp[] = [
  new RegExp(`!3d${NUMBER}!4d${NUMBER}`),
  new RegExp(`@${NUMBER},${NUMBER}`),
  new RegExp(`[?&](?:q|query|ll|destination|center)=${NUMBER}(?:,|%2C)\\s*${NUMBER}`, 'i'),
  new RegExp(`^\\s*${NUMBER}\\s*,\\s*${NUMBER}\\s*$`),
]

export function parseMapsLink(input: string): MapsLinkResult {
  const text = input.trim()
  if (/^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(text)) {
    return { ok: false, reason: 'short-link' }
  }

  for (const pattern of PATTERNS) {
    const match = text.match(pattern)
    if (!match) continue
    const lat = Number(match[1])
    const lng = Number(match[2])
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      return { ok: true, lat, lng }
    }
  }

  return { ok: false, reason: 'no-coordinates' }
}
