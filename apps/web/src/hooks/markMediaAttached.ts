import type { CollectionAfterChangeHook } from 'payload'
import { mediaIdsIn } from '../lib/field-shape'

/**
 * Marks a partner's uploads as attached once a saved page points at them.
 *
 * A partner's upload is readable only by staff and the uploader until then
 * (access mediaRead), so a menu draft or a photo they decided against is not
 * listed to anyone else. A public page reads its images with
 * `overrideAccess: false`, so the moment a listing, room type, article or
 * issue uses one it has to become readable, and this does that in the same
 * request (and transaction) as the save.
 *
 * Generic: the media ids come from the collection's own field config
 * (lib/field-shape mediaIdsIn), so it needs no list of field names. Team
 * uploads (no `uploadedBy`) and ones already flagged are filtered out in the
 * query, so an ordinary save costs one indexed lookup that finds nothing.
 *
 * Once attached stays attached: removing the photo later does not hide it
 * again, because it has already been public. Media used only inside rich text
 * is not found here; staff can tick "Attached" by hand for that.
 */
export const markMediaAttached: CollectionAfterChangeHook = async ({ doc, collection, req }) => {
  const ids = [...new Set(mediaIdsIn(doc, collection.fields))]
  if (ids.length === 0) return doc

  await req.payload.update({
    collection: 'media',
    where: {
      and: [
        { id: { in: ids } },
        { uploadedBy: { exists: true } },
        { or: [{ attached: { equals: false } }, { attached: { exists: false } }] },
      ],
    },
    data: { attached: true },
    depth: 0,
    overrideAccess: true,
    req,
  })
  return doc
}
