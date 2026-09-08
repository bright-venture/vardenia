import type { CollectionBeforeDeleteHook } from 'payload'

/**
 * Clear the saves that point at a row before the row itself is deleted.
 *
 * `saved_listings.customer_id` and `.listing_id` are required, so their foreign
 * keys are `on delete set null` on a `not null` column - the same contradiction
 * closeRatherThanDelete documents for bookings. Postgres would try to null the
 * column, the constraint would reject it, and the parent delete would fail with
 * "an unknown error" that says nothing about a saved place. Removing the saves
 * first leaves nothing to null.
 *
 * Runs last in a collection's `beforeDelete`, after the guards that may call the
 * delete off (a printed code, an existing booking): if one of those throws, this
 * never runs and the transaction is rolled back anyway; if they pass, the saves
 * go and the delete proceeds. `overrideAccess` because it acts on behalf of
 * whoever is allowed to delete the parent, not on behalf of the saver.
 */
export const cleanupSavedListings =
  (field: 'customer' | 'listing'): CollectionBeforeDeleteHook =>
  async ({ id, req }) => {
    await req.payload.delete({
      collection: 'saved-listings',
      where: { [field]: { equals: id } },
      overrideAccess: true,
      req,
    })
  }
