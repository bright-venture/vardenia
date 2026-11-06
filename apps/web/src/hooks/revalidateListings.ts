import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import { LOCALES } from '@vardenia/i18n'

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

export const clearListingsCache = async () => {
  try {
    const { revalidateTag } = await import('next/cache')
    // Expire now, as the one-argument call did before Next 16: a publish should
    // show on the next view, not after a stale one is served while it refreshes.
    revalidateTag('businesses', { expire: 0 })
  } catch {
    // Outside a Next request. Nothing is cached, so nothing needs clearing.
  }
}

/**
 * Rebuilds one listing's own page, at every address it has had.
 *
 * The directory query above is tagged, but the listing page is not: it is
 * prerendered and kept for an hour (directory/[slug]/page.tsx), and when that
 * hour runs out the first visitor still gets the old copy while a new one is
 * built behind them. So a renamed listing kept its old title on its own page
 * for an hour or more. Measured on 6 November 2026: the database said "Rashfet
 * Bann", the page still said "Rashfet Bon".
 *
 * Both slugs, because a slug change leaves a stored copy at the old address,
 * which should go now rather than linger until it expires. Each language
 * prefix and the bare English address, since English is served unprefixed and
 * kept under its rewritten `/en/...` path.
 */
export const listingPaths = (slugs: (string | null | undefined)[]): string[] => {
  const unique = [...new Set(slugs.filter((slug): slug is string => Boolean(slug)))]
  return unique.flatMap((slug) => [
    `/directory/${slug}`,
    ...LOCALES.map((locale) => `/${locale}/directory/${slug}`),
  ])
}

const clearListingPages = async (slugs: (string | null | undefined)[]) => {
  try {
    const { revalidatePath } = await import('next/cache')
    for (const path of listingPaths(slugs)) revalidatePath(path)
  } catch {
    // Outside a Next request. Nothing is cached, so nothing needs clearing.
  }
}

/**
 * Drops every QR code's stored destination when a listing's address or
 * visibility changes.
 *
 * `/g/[code]` keeps each code's destination for an hour (see the route), and
 * only an edit to the code itself cleared it. A listing whose slug changed kept
 * its printed code pointing at the old address, and once the old page's stored
 * copy ran out, the reader scanning the magazine landed on "not found". Seen on
 * 6 November 2026, renaming Keserwan slugs to match the magazine.
 *
 * Only on those two changes: a description edit does not move a code, and the
 * tag is collection-wide, so clearing it costs one lookup per code afterwards.
 */
const clearQrDestinations = async () => {
  try {
    const { revalidateTag } = await import('next/cache')
    revalidateTag('qr-codes', { expire: 0 })
  } catch {
    // Outside a Next request. Nothing is cached, so nothing needs clearing.
  }
}

type ListingDoc = { slug?: string | null; _status?: string | null }

export const revalidateListingsAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
}) => {
  const now = doc as ListingDoc
  const before = (previousDoc ?? {}) as ListingDoc
  await clearListingsCache()
  await clearListingPages([now.slug, before.slug])
  if (now.slug !== before.slug || now._status !== before._status) await clearQrDestinations()
  return doc
}

export const revalidateListingsAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await clearListingsCache()
  await clearListingPages([(doc as ListingDoc).slug])
  await clearQrDestinations()
  return doc
}
