import type { CollectionBeforeDeleteHook } from 'payload'
import { APIError } from 'payload'

/**
 * A listing goes to the trash before it can be deleted for good (22 November 2026).
 *
 * The PRD (Authentication and Accounts v2, section 6): "Listings are not
 * deleted at once: they go to a trash first, and a permanent delete is refused
 * while a listing has a printed code or bookings."
 *
 * `trash: true` makes the admin's ordinary Delete a move to the trash (a PATCH
 * setting `deletedAt`). But a DELETE request removes the row at once whether
 * or not it is in the trash: the admin's "Delete permanently" option sends one,
 * and so does `DELETE /api/businesses/:id`. In the 22 November test run an
 * admin's API delete removed a listing with no way back.
 *
 * So a signed-in person's delete is refused unless the listing is already in
 * the trash. Deleting from the trash, the deliberate second step, still works
 * and still meets the printed-code and booking guards after this one.
 *
 * Scripts that run without a signed-in person (the demo-import teardown, the
 * seed) are not affected: they remove listings they created themselves.
 */
export const requireTrashFirst: CollectionBeforeDeleteHook = async ({ collection, id, req }) => {
  if (!req.user) return

  const doc = (await req.payload.findByID({
    collection: collection.slug as 'businesses',
    id,
    trash: true,
    depth: 0,
    overrideAccess: true,
    req,
  })) as { deletedAt?: string | null } | null

  if (doc?.deletedAt) return

  throw new APIError(
    'Listings go to the trash first. Move this listing to the trash, then delete it from there if you really mean to remove it for good.',
    400,
  )
}
