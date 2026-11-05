import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

/**
 * A photo can be replaced or relabelled without editing its listing. Expire
 * media-dependent reads so the homepage selection does not retain the old
 * file URL, alt text, or image eligibility until its hourly refresh.
 */
const clear = async () => {
  try {
    const { revalidateTag } = await import('next/cache')
    revalidateTag('media', { expire: 0 })
  } catch {
    // Like the listing/QR hooks, this also runs in CLI imports and migrations
    // outside a Next request, where there is no request cache to invalidate.
  }
}

export const revalidateMediaAfterChange: CollectionAfterChangeHook = async ({ doc }) => {
  await clear()
  return doc
}

export const revalidateMediaAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await clear()
  return doc
}
