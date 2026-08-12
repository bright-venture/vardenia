import type { CollectionBeforeDeleteHook } from 'payload'
import { APIError } from 'payload'

/**
 * Stops a code that exists in the physical world from being deleted.
 *
 * This is not hypothetical. A listing was deleted and recreated during testing,
 * and its code silently changed from MWSW9XS to AASBVQR. Before a print run that
 * costs nothing. After one, every copy carrying the old code points at nothing,
 * there is no way to reissue the old code against the new listing, and the paper
 * stays in circulation for a year.
 *
 * `active: false` already exists for exactly this: a retired code lands on the
 * "this listing has moved" page instead of a dead end. Deletion has no
 * equivalent, so it is refused rather than made safe.
 */

/**
 * A code counts as out in the world once any of these is true. A digital-only
 * code that has never been scanned has never left the CMS, so it is still free
 * to delete - which keeps mistakes made during setup cheap to undo.
 */
function committedReason(qr: Record<string, any>): string | null {
  if (typeof qr.scanCount === 'number' && qr.scanCount > 0) {
    return `it has been scanned ${qr.scanCount} time${qr.scanCount === 1 ? '' : 's'}`
  }
  if (qr.issue) return 'it is assigned to a print issue'
  if (qr.placement && qr.placement !== 'digital') return `it was produced as a ${qr.placement}`
  return null
}

const RETIRE_INSTEAD =
  'Uncheck "active" instead. Retired codes land on the "this listing has moved" page, ' +
  'which is what keeps already-printed copies working.'

export const protectPrintedCodes: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const qr = await req.payload.findByID({
    collection: 'qr-codes',
    id,
    depth: 0,
    overrideAccess: true,
  })

  const reason = committedReason(qr as Record<string, any>)
  if (!reason) return

  throw new APIError(
    `Code ${(qr as { code?: string }).code} cannot be deleted because ${reason}. ${RETIRE_INSTEAD}`,
    400,
  )
}

/**
 * The same protection, one step removed.
 *
 * Deleting the business deletes nothing about the code directly, but recreating
 * the listing mints a fresh code (see hooks/ensureQrCode), so the printed one is
 * orphaned just as permanently. This is the exact route the real mistake took.
 */
export const protectBusinessWithPrintedCode: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const codes = await req.payload.find({
    collection: 'qr-codes',
    where: { business: { equals: id } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  const blocked = codes.docs
    .map((doc) => ({ doc: doc as Record<string, any>, reason: committedReason(doc as never) }))
    .filter((entry) => entry.reason !== null)

  if (blocked.length === 0) return

  const detail = blocked.map((entry) => `${entry.doc.code} (${entry.reason})`).join(', ')

  throw new APIError(
    `This listing owns a code that is already in circulation: ${detail}. ` +
      'Deleting the listing and making it again would mint a different code and strand the ' +
      'printed one. Edit this listing instead, or retire its code first.',
    400,
  )
}
