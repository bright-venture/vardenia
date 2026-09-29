/**
 * Which places to suggest at the foot of a listing, nearest first.
 *
 * Distance when both places have coordinates, and the map's own units when
 * they do not. The coordinates come from the Google Maps link staff paste on a
 * listing (see lib/maps-paste), and in September 2026 production had none at
 * all, so everything below the first rule is not a fallback for rare cases: it
 * is what almost every listing uses until the links are filled in. As they are,
 * suggestions move from "same district" to "1.2 km away" with no further change.
 *
 * # The order
 *
 * 1. Places with coordinates within NEARBY_RADIUS_KM, closest first.
 * 2. The same district, in the directory's own order (featured, tier, name).
 * 3. The same governorate, likewise.
 * 4. Anything else in the category, so a listing with no neighbours still
 *    offers somewhere to go next. These are marked not near, and the page
 *    only calls the section "Nearby" when at least one suggestion is.
 *
 * Pure: the candidates arrive in directory order and the caller fetches them.
 */

/** Lebanon is about 225 km long; past this, "nearby" stops being true. */
export const NEARBY_RADIUS_KM = 30

/** A listing reduced to where it is. `location` is Payload's point: [lng, lat]. */
export interface Placed {
  id: number
  location?: [number, number] | number[] | null
  district?: string | null
  governorate?: string | null
}

export interface NearbyPick {
  id: number
  /** Straight-line distance, whenever both places have coordinates. */
  km: number | null
  /** Within the radius, or in the same district or governorate. */
  near: boolean
}

const EARTH_KM = 6371

const point = (value: Placed['location']): { lat: number; lng: number } | null => {
  if (!Array.isArray(value) || value.length !== 2) return null
  const [lng, lat] = value
  return typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
    ? { lat, lng }
    : null
}

/** Great-circle distance in km. Plenty accurate at the scale of a country. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h))
}

export function rankNearby(subject: Placed, candidates: Placed[], count = 3): NearbyPick[] {
  const others = candidates.filter((c) => c.id !== subject.id)
  const here = point(subject.location)
  const picked: NearbyPick[] = []
  const taken = new Set<number>()

  const take = (candidate: Placed, km: number | null, near: boolean) => {
    if (picked.length >= count || taken.has(candidate.id)) return
    taken.add(candidate.id)
    picked.push({ id: candidate.id, km, near })
  }

  if (here) {
    others
      .flatMap((candidate) => {
        const there = point(candidate.location)
        if (!there) return []
        const km = distanceKm(here, there)
        return km <= NEARBY_RADIUS_KM ? [{ candidate, km }] : []
      })
      .sort((a, b) => a.km - b.km)
      .forEach(({ candidate, km }) => take(candidate, km, true))
  }

  // Past the radius a distance is still worth showing: "45 km" is more use
  // than a governorate name when both are known.
  const kmTo = (candidate: Placed) => {
    const there = point(candidate.location)
    return here && there ? distanceKm(here, there) : null
  }

  if (subject.district) {
    others.filter((c) => c.district === subject.district).forEach((c) => take(c, kmTo(c), true))
  }
  if (subject.governorate) {
    others
      .filter((c) => c.governorate === subject.governorate)
      .forEach((c) => take(c, kmTo(c), true))
  }
  others.forEach((c) => take(c, kmTo(c), false))

  return picked
}
