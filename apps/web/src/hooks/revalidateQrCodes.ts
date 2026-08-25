import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

/**
 * Drops the cached code-to-destination map when a QR code changes.
 *
 * The `/g/[code]` redirect caches each lookup for an hour, so that a scan is
 * not a live database round trip and so that an outage does not send printed
 * codes to a dead end. The cost of that cache is staleness, and staleness is
 * exactly what this route must not have: the whole reason the redirect layer
 * exists is that a printed code is permanent while its destination is not - see
 * ADR 0002.
 *
 * So an edit clears it immediately. Retargeting a code, or deactivating one, is
 * a deliberate act by somebody who then expects to scan the paper and see the
 * new answer. An hour of the old one would read as the change not having saved.
 *
 * Deleting matters as much as changing: a code that no longer exists must stop
 * resolving, and the cached miss is what makes the "not found" page correct
 * rather than merely eventual.
 *
 * # Imported where it is used, and allowed to fail
 *
 * Same reasoning as revalidateListings: `next/cache` only works inside a Next
 * request, and these hooks also run from the seed script and from `payload
 * migrate`, where there is no server holding a cache and nothing to clear. A
 * failure there is genuinely nothing to report.
 */

const clear = async () => {
  try {
    const { revalidateTag } = await import('next/cache')
    revalidateTag('qr-codes')
  } catch {
    // Outside a Next request. Nothing is cached, so nothing needs clearing.
  }
}

export const revalidateQrCodesAfterChange: CollectionAfterChangeHook = async ({ doc }) => {
  await clear()
  return doc
}

export const revalidateQrCodesAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await clear()
  return doc
}
