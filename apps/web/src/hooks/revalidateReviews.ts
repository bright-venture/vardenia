import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

/**
 * Listing pages show their reviews, and are built once an hour. So a review
 * staff took down stayed on the page for up to an hour after moderation, which
 * is exactly the window in which something abusive does its damage. Any change
 * to a review now rebuilds the listing pages on their next view.
 *
 * The listing route rather than one slug: a review knows its listing's id, not
 * its address in ten languages, and moderation is rare enough that rebuilding
 * every listing page on demand costs nothing worth saving.
 *
 * Imported where it is used and allowed to fail, as in revalidateListings:
 * outside a Next request (seed, migrate, scripts) there is no cache to clear.
 */
const clear = async () => {
  try {
    const { revalidatePath } = await import('next/cache')
    // The route as the filesystem names it, route group included, which is how
    // revalidatePath matches a dynamic pattern.
    revalidatePath('/(frontend)/[locale]/directory/[slug]', 'page')
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
