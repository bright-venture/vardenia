import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

/**
 * Clears the cached directory when a listing changes.
 *
 * `findListings` caches each query for 60 seconds under a key built from the
 * filters, and tagged `businesses` - with a comment saying a future
 * `revalidateTag` would clear it on publish. That future never arrived, and the
 * gap showed itself the first time a listing was added to production:
 *
 *   /directory                  -> "No places found"
 *   /directory?category=food-beverage -> "1 place"
 *
 * Which reads as a broken filter and is nothing of the kind. Every filter is its
 * own cache key. The unfiltered key had been warmed while the site had no
 * listings at all and was still serving that answer; the category key had never
 * been asked for before, so it went to the database and got the truth. Two keys,
 * filled at different times, disagreeing exactly as designed.
 *
 * Sixty seconds would have healed it. But sixty seconds of a directory that says
 * "No places found" is sixty seconds of the page a printed QR code leads to
 * looking empty, and the person who just published the listing reasonably
 * concludes the site is broken. Publishing should be visible immediately.
 *
 * # Imported where it is used, and allowed to fail
 *
 * `next/cache` only works inside a Next request. The same hooks run from the
 * seed script, from `payload migrate` and from any throwaway script that opens a
 * Payload instance, where calling it throws. There is nothing to invalidate in
 * those contexts anyway - no server is holding a cache - so a failure here is
 * genuinely nothing to report.
 */

const clear = async () => {
  try {
    const { revalidateTag } = await import('next/cache')
    revalidateTag('businesses')
  } catch {
    // Outside a Next request. Nothing is cached, so nothing needs clearing.
  }
}

export const revalidateListingsAfterChange: CollectionAfterChangeHook = async ({ doc }) => {
  await clear()
  return doc
}

export const revalidateListingsAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await clear()
  return doc
}
