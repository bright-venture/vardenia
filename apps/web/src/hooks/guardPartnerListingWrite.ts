import { APIError, type CollectionBeforeOperationHook, type PayloadRequest } from 'payload'
import { PARTNER_EDITABLE_FIELDS } from '@vardenia/core'
import { BUSINESS_USER_COLLECTION, ownedBusinessIds } from '../access/index'
import { ShapeProblem, checkAllowedBody, mediaIdsIn } from '../lib/field-shape'
import { assertOwnMedia } from '../lib/partner-media'

/**
 * What a partner may change on their own listing (Task 3, 20 November 2026).
 *
 * `access.update` (staffOrOwnedListing) decides which rows a business-user can
 * reach: the listings attached to their account. This decides what they may
 * send, and it is the load-bearing half, because Payload's field-level access
 * only covers the fields that declare it - a partner could otherwise publish
 * their listing, move it to another category or clear its listing number.
 *
 *  - Every top-level key must be on core PARTNER_EDITABLE_FIELDS and a real
 *    field of the listing. Everything else is refused with a 400 naming it:
 *    `_status`, tier, slug, the commercial, magazine and submission fields,
 *    Payload's own `id`/`createdAt`/`deletedAt`, and any name nobody thought of.
 *  - Inside an allowed group, array row or block, every key must be a field of
 *    that group (plus a row's own `id`). Unknown sub-keys are REFUSED, not
 *    stripped, so `contact: { _status: ... }` or a made-up key fails loudly.
 *    Relations must be plain ids, not objects.
 *  - Media named in the body must already be on this listing or have been
 *    uploaded by this partner (lib/partner-media).
 *  - One listing at a time: an update by `where` is refused, and so is one
 *    that reaches into the trash (`trash: true`).
 *
 * A `beforeOperation` hook, like guardSelfAccountUpdate, because it sees the
 * body as sent - REST JSON, form data and local API alike - before Payload
 * fills in defaults, and because it knows whether the write overrides access.
 *
 * Staff pass untouched. So does the server's own code (`overrideAccess`),
 * including writes made inside a partner's request: ensureQrCode and
 * autoTranslateListing update the listing with the partner's `req` after their
 * save. Customers and anonymous callers are refused by access; creating and
 * deleting a listing stay staff-only there too.
 */
export const guardPartnerListingWrite: CollectionBeforeOperationHook = async ({
  args,
  operation,
  overrideAccess,
  collection,
  req,
}) => {
  if (operation !== 'update') return args
  if (overrideAccess === true || (args as { overrideAccess?: boolean })?.overrideAccess === true) {
    return args
  }
  const user = req?.user as { id?: string | number; collection?: string } | null | undefined
  if (!user || user.collection !== BUSINESS_USER_COLLECTION) return args

  const { id, data, trash } = args as { id?: string | number; data?: unknown; trash?: boolean }
  if (id === undefined || id === null || id === '') {
    throw new APIError('Update one listing at a time.', 400, null, true)
  }
  // `?trash=true` lets an update reach a listing in the trash. A trashed
  // listing is the team's to restore or delete, not the owner's to edit.
  if (trash === true) {
    throw new APIError('A listing in the trash cannot be edited.', 400, null, true)
  }

  let media: (string | number)[]
  try {
    media = checkAllowedBody(data, collection.fields, PARTNER_EDITABLE_FIELDS)
  } catch (error) {
    if (error instanceof ShapeProblem) throw new APIError(error.message, 400, null, true)
    throw error
  }

  if (!ownedBusinessIds(user).map(String).includes(String(id))) {
    throw new APIError('You can only edit your own listings.', 403, null, true)
  }

  if (media.length > 0 && user.id !== undefined) {
    const saved = await req.payload
      .findByID({ collection: 'businesses', id, depth: 0, overrideAccess: true, req })
      .catch(() => null)
    await assertOwnMedia({
      req: req as PayloadRequest,
      partnerId: user.id,
      ids: media,
      alreadyOn: saved ? mediaIdsIn(saved, collection.fields) : [],
    })
  }

  return args
}
