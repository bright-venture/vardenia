import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

/**
 * Refresh the listing page when one of its reviews changes.
 *
 * # The bug this fixes
 *
 * The Reviews collection shipped with no hooks at all. Publishing a review in
 * the admin panel changed the database and nothing else: the listing page is
 * prerendered with `revalidate = 60`, so the review appeared up to a minute
 * later, and the person who had just published it reasonably concluded the
 * feature was broken.
 *
 * That is the same failure the directory had, and the same reasoning applies -
 * see hooks/revalidateListings. Sixty seconds is not a long time unless you are
 * staring at the page you just published to.
 *
 * # Why a path and not just a tag
 *
 * `revalidateTag('businesses')` clears the `findListings` cache, which is what
 * the grids read. It does nothing for the listing detail page, because that
 * page is not built from a tagged fetch - it is a prerendered route with a time
 * based revalidate. Only `revalidatePath` invalidates that.
 *
 * Both are called. The tag covers the rating shown on a card in a grid; the
 * path covers the review itself on the page it belongs to.
 *
 * # Why every listing page rather than one
 *
 * The route is invalidated by its pattern, so all listing pages regenerate
 * rather than just the one that changed. Finding the single page would mean
 * resolving the review's business to its slug and rebuilding both locale paths,
 * which is a query and two string builds to save regenerating pages that are
 * regenerated on demand anyway.
 *
 * Reviews are written by staff, a handful at a time, on a directory with tens
 * of listings. If that stops being true this is worth narrowing - it is a
 * deliberate trade at this size, not an oversight.
 *
 * # Allowed to fail
 *
 * `next/cache` only works inside a Next request. These hooks also run from the
 * seed script and from `payload migrate`, where calling it throws and where
 * there is no cache to clear anyway.
 */

const clear = async () => {
  try {
    const { revalidateTag, revalidatePath } = await import('next/cache')

    // The grids, which read findListings and show the aggregate rating.
    revalidateTag('businesses')

    // The listing pages themselves. Route groups do not appear in the URL, so
    // the pattern is the path as a reader sees it, with its dynamic segments.
    revalidatePath('/[locale]/directory/[slug]', 'page')
  } catch {
    // Outside a Next request. Nothing is cached, so nothing needs clearing.
  }
}

export const revalidateReviewsAfterChange: CollectionAfterChangeHook = async ({ doc }) => {
  await clear()
  return doc
}

export const revalidateReviewsAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await clear()
  return doc
}
