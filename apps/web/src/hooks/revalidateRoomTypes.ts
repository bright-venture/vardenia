import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, Payload } from 'payload'
import { clearListingsCache, listingPaths } from './revalidateListings'

/**
 * A changed room type shows on its hotel's page at once.
 *
 * The listing page is prerendered and kept for an hour (see
 * hooks/revalidateListings), and the room types are part of it. So a partner
 * who adds a suite would not see it on their own page for up to an hour.
 * Clearing the hotel's page, at every language, and the directory's cached
 * queries (a hotel's "has room types" changes what its card says) fixes that.
 *
 * Allowed to fail, for the same reason as revalidateListings: outside a Next
 * request there is no cache to clear.
 */
async function clearHotel(payload: Payload, business: unknown) {
  const id =
    typeof business === 'object' && business !== null ? (business as { id?: unknown }).id : business
  if (typeof id !== 'number' && typeof id !== 'string') return
  try {
    const doc = await payload.findByID({
      collection: 'businesses',
      id,
      depth: 0,
      overrideAccess: true,
      select: { slug: true },
    })
    const { revalidatePath } = await import('next/cache')
    for (const path of listingPaths([(doc as { slug?: string | null }).slug])) revalidatePath(path)
  } catch {
    // Outside a Next request, or the listing is gone: nothing to clear.
  }
  await clearListingsCache()
}

export const revalidateRoomTypeAfterChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  await clearHotel(req.payload, (doc as { business?: unknown }).business)
  return doc
}

export const revalidateRoomTypeAfterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await clearHotel(req.payload, (doc as { business?: unknown }).business)
  return doc
}
