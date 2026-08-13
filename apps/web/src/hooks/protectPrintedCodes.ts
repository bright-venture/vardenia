import type { CollectionBeforeDeleteHook } from 'payload'
import { APIError } from 'payload'
import type { QrDoc } from '../lib/qr-doc'

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
 * A code counts as out in the world once either of these is true.
 *
 * Placement is deliberately not a signal. Every code is minted as `magazine-page`
 * because that is the only surface codes appear on, so it is the same value on
 * every row and tells us nothing about whether this particular code has been
 * committed to anything.
 *
 * What does tell us: being attached to an issue, which is the act of putting a
 * code into a layout, and having been scanned, which means a reader has already
 * found it. A freshly minted code that is on no issue and has never been scanned
 * exists only in the CMS, so deleting it is free - which keeps setup mistakes
 * cheap to undo.
 *
 * Attached-but-unprinted is treated as committed rather than checking the
 * issue's publish date. The asymmetry is the point: refusing to delete a code
 * that was still safe costs one extra click to unassign it, while allowing one
 * through leaves a dead code in a layout that nobody notices until the proofs
 * come back.
 */
function committedReason(qr: QrDoc): string | null {
  if (typeof qr.scanCount === 'number' && qr.scanCount > 0) {
    return `it has been scanned ${qr.scanCount} time${qr.scanCount === 1 ? '' : 's'}`
  }
  if (qr.issue) return 'it is assigned to a print issue'
  return null
}

const RETIRE_INSTEAD =
  'Uncheck "active" instead. Retired codes land on the "this listing has moved" page, ' +
  'which is what keeps already-printed copies working. If the code was never printed, ' +
  'clear its issue first and then delete it.'

export const protectPrintedCodes: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const qr = await req.payload.findByID({
    collection: 'qr-codes',
    id,
    depth: 0,
    overrideAccess: true,
  })

  const doc = qr as unknown as QrDoc
  const reason = committedReason(doc)
  if (!reason) return

  throw new APIError(`Code ${doc.code} cannot be deleted because ${reason}. ${RETIRE_INSTEAD}`, 400)
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
    .map((doc) => doc as unknown as QrDoc)
    .map((doc) => ({ doc, reason: committedReason(doc) }))
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
