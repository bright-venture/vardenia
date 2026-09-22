/**
 * Where "get directions" and "view on map" point.
 *
 * # Why a link and not a map
 *
 * The site used to draw its own map: Leaflet, raster tiles, clustering, a "near
 * me" control. It was removed before launch for one blunt reason - no listing in
 * the catalogue has coordinates, so the map had no pins to draw and the
 * directions button never rendered at all. A hosted tile subscription costs
 * money every month to show an empty rectangle, and the free tiles it fell back
 * to are not licensed for commercial use.
 *
 * A link needs none of that. It costs nothing, needs no API key, widens no
 * Content-Security-Policy, and on a phone it opens the Maps app the reader
 * already navigates with. Someone who has just scanned a code in a hotel lobby
 * wants turn-by-turn directions, not a pannable rectangle.
 *
 * # Why it works without coordinates
 *
 * Google Maps takes a free-text `query`, not only a latitude and longitude. A
 * name plus its town finds a known business reliably, which is why every listing
 * can offer directions today rather than after a geocoding pass.
 *
 * Coordinates are still preferred when a listing has them, because a point is
 * exact and a name is a search. Nothing here needs changing when they arrive -
 * the same function simply starts taking the first branch.
 */

export interface MapsTarget {
  name: string
  /** The address line, when the listing has one. */
  address?: string | null
  /** Localized place, e.g. "Achrafieh, Beirut". Disambiguates a chain. */
  place?: string | null
  /** Payload stores points as [longitude, latitude]. */
  coordinates?: [number, number] | null
}

/** The country is appended so a name that exists elsewhere resolves here. */
const COUNTRY = 'Lebanon'

/**
 * A Google Maps URL for this listing.
 *
 * With coordinates it points at the exact spot. Without them it searches for the
 * business by name and place, which is what makes the link work for a catalogue
 * that has not been geocoded.
 */
export function mapsLink(target: MapsTarget): string {
  const query = mapsQuery(target)
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/**
 * The text a search falls back to.
 *
 * Exported for the tests, and because the query is the part worth checking: a
 * link is only as good as what it looks for. Duplicate terms are dropped so
 * "Aley" in both the address and the place does not appear twice, and the parts
 * are joined with commas because that is how Maps reads an address.
 */
export function mapsQuery({ name, address, place, coordinates }: MapsTarget): string {
  // Payload stores [longitude, latitude]; Maps wants the opposite order. Getting
  // this backwards drops the pin in the wrong hemisphere.
  if (coordinates) return `${coordinates[1]},${coordinates[0]}`

  const parts: string[] = []
  const seen = new Set<string>()

  for (const part of [name, address, place, COUNTRY]) {
    const value = (part ?? '').replace(/\s+/g, ' ').trim()
    if (!value) continue
    const key = value.toLowerCase()
    // A place that merely repeats the address, or an address already inside the
    // name, adds nothing to the search and makes it noisier.
    if (seen.has(key)) continue
    if (parts.some((p) => p.toLowerCase().includes(key))) continue
    seen.add(key)
    parts.push(value)
  }

  return parts.join(', ')
}
