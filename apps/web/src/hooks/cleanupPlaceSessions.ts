import type { CollectionBeforeDeleteHook } from 'payload'

/**
 * Removes a business's Magazine Places upload sessions before the business
 * itself is deleted for good.
 *
 * `place_upload_sessions.business_id` is NOT NULL with a foreign key `on delete
 * set null` (what Payload generates for a required relationship), the same
 * contradiction hooks/cleanupSavedListings describes: Postgres would try to
 * null the column, the constraint would reject it, and the permanent delete of
 * a form-created business would fail with "an unknown error". Deleting the
 * sessions first leaves nothing to null. Runs last in `beforeDelete`, after the
 * guards that may call the delete off, in the delete's own transaction.
 * `overrideAccess` because the collection is closed to every API.
 */
export const cleanupPlaceSessions: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.delete({
    collection: 'place-upload-sessions',
    where: { business: { equals: id } },
    overrideAccess: true,
    req,
  })
}
