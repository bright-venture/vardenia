import { APIError, type CollectionBeforeOperationHook } from 'payload'

/**
 * A size limit for one upload collection.
 *
 * Payload has a single, site-wide upload limit (payload.config `upload.limits`)
 * and no per-collection one. Magazine PDFs need 200 MB (collections/Editions),
 * and their direct-to-storage upload reads that same site-wide limit, so it is
 * set to 200 MB - and every other upload collection takes its own, smaller
 * limit from here, so a photo is held to 25 MB as before.
 *
 * Runs before the operation, on the parsed upload, so an oversized file is
 * refused with a readable message before anything is resized or stored.
 */

export const PHOTO_MAX_BYTES = 25 * 1024 * 1024

export function limitUploadSize(maxBytes: number, what: string): CollectionBeforeOperationHook {
  return ({ req, operation }) => {
    if (operation !== 'create' && operation !== 'update') return
    const size = req.file?.size
    if (typeof size === 'number' && size > maxBytes) {
      const mb = (bytes: number) => Math.round(bytes / (1024 * 1024))
      throw new APIError(
        `That file is ${mb(size)} MB. ${what} can be up to ${mb(maxBytes)} MB: export a smaller version and try again.`,
        413,
      )
    }
  }
}
