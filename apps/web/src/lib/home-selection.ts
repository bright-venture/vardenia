import { resolvePhotograph, type MediaLike } from './media'

export const HOME_PLACES_LIMIT = 6

export interface HomeCandidate {
  id: number
  slug?: string | null
  name?: string | null
  category?: string | null
  governorate?: string | null
  verified?: boolean | null
  _status?: 'draft' | 'published' | null
  heroImage?: number | string | (MediaLike & { mimeType?: string | null }) | null
}

/** Eligibility is factual, not a paid placement or an invented editorial endorsement. */
export function isHomeCandidate(listing: HomeCandidate): boolean {
  const image = listing.heroImage
  return Boolean(
    listing._status === 'published' &&
    listing.verified === true &&
    listing.slug?.trim() &&
    listing.name?.trim() &&
    image &&
    typeof image === 'object' &&
    image.mimeType?.startsWith('image/') &&
    resolvePhotograph(image),
  )
}

/**
 * A small, stable introduction to the directory. Prefer an unseen category and
 * region, then balance repeat appearances. The incoming order breaks ties, so
 * switching language does not shuffle the places. Never pad with fake venues,
 * unverified records or the shared import photograph.
 */
export function selectHomePlaces<T extends HomeCandidate>(
  candidates: readonly T[],
  excludedIds: readonly number[] = [],
): T[] {
  const ids = new Set(excludedIds)
  const slugs = new Set<string>()
  const pool = candidates.filter((listing) => {
    if (!isHomeCandidate(listing) || ids.has(listing.id) || slugs.has(listing.slug!)) return false
    ids.add(listing.id)
    slugs.add(listing.slug!)
    return true
  })
  const categories = new Map<string, number>()
  const regions = new Map<string, number>()
  const selected: T[] = []
  const count = (counts: Map<string, number>, value: string | null | undefined) =>
    value ? (counts.get(value) ?? 0) : HOME_PLACES_LIMIT

  while (pool.length && selected.length < HOME_PLACES_LIMIT) {
    let bestIndex = 0
    let bestScore = Infinity
    pool.forEach((listing, index) => {
      const score = count(categories, listing.category) * 2 + count(regions, listing.governorate)
      if (score < bestScore) {
        bestScore = score
        bestIndex = index
      }
    })
    const [listing] = pool.splice(bestIndex, 1)
    if (!listing) break
    selected.push(listing)
    if (listing.category) categories.set(listing.category, count(categories, listing.category) + 1)
    if (listing.governorate)
      regions.set(listing.governorate, count(regions, listing.governorate) + 1)
  }
  return selected
}
