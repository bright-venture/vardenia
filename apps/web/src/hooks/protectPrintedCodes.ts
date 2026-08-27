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

/**
 * The other way past, for emptying the database before launch.
 *
 * Broader than the batch teardown and deliberately shaped so it cannot reach
 * the one code that matters. `clearAllListings` permits deleting a code that
 * belongs to a listing; it never permits deleting a code that belongs to none,
 * which is exactly what the `home` code pointing at vardenia.com is.
 *
 * That distinction is the whole safety property. "Remove every listing" and
 * "remove the printed code on the back cover" are different requests, and the
 * second one has never been asked for.
 *
 * Reachable only through the local API - Payload does not let a REST caller set
 * `context` - so this is a thing a script does with a database URL in hand, not
 * a thing an HTTP request can do.
 */
function isClearingListings(
  context: Record<string, unknown>,
  businessId: string | number | null | undefined,
): boolean {
  if (context.clearAllListings !== true) return false
  return businessId !== null && businessId !== undefined
}

/**
 * One way past the guard above, for removing a bulk import.
 *
 * Bulk-imported listings are not customers. A demo directory has to be
 * removable afterwards, and by then somebody on the team will have scanned one
 * of the codes to show it working - which is exactly what `committedReason`
 * treats as "in circulation" and refuses to delete. Without a way through, a
 * single demo scan strands a row permanently.
 *
 * # Why the context flag alone is not the permission
 *
 * The caller passes the batch it intends to remove, but the answer comes from
 * the database: this returns true only when the listing itself carries that
 * exact `importBatch`. A person creating a listing in the admin panel never
 * sets that field - it is read-only and staff-only - so no real listing can be
 * reached this way, whatever a caller claims.
 *
 * That asymmetry is deliberate. If the flag were the permission, anything able
 * to set context would inherit the power to delete a printed code, which is the
 * failure this whole file exists to prevent.
 */
async function isTeardownOfBatch(
  req: Parameters<CollectionBeforeDeleteHook>[0]['req'],
  context: Record<string, unknown>,
  businessId: string | number | null | undefined,
): Promise<boolean> {
  const batch = context.importTeardown
  if (typeof batch !== 'string' || batch === '') return false
  if (businessId === null || businessId === undefined) return false

  try {
    const business = await req.payload.findByID({
      collection: 'businesses',
      id: businessId,
      depth: 0,
      overrideAccess: true,
    })

    return (business as { importBatch?: string }).importBatch === batch
  } catch {
    // A missing listing is not a licence to delete. Refusing is the safe answer.
    return false
  }
}

export const protectPrintedCodes: CollectionBeforeDeleteHook = async ({ id, req, context }) => {
  const qr = await req.payload.findByID({
    collection: 'qr-codes',
    id,
    depth: 0,
    overrideAccess: true,
  })

  const doc = qr as unknown as QrDoc
  const reason = committedReason(doc)
  if (!reason) return

  const business = doc.business
  const businessId =
    typeof business === 'object' && business !== null
      ? (business as { id?: string | number }).id
      : business

  if (isClearingListings(context, businessId)) return
  if (await isTeardownOfBatch(req, context, businessId)) return

  throw new APIError(`Code ${doc.code} cannot be deleted because ${reason}. ${RETIRE_INSTEAD}`, 400)
}

/**
 * The same protection, one step removed.
 *
 * Deleting the business deletes nothing about the code directly, but recreating
 * the listing mints a fresh code (see hooks/ensureQrCode), so the printed one is
 * orphaned just as permanently. This is the exact route the real mistake took.
 */
export const protectBusinessWithPrintedCode: CollectionBeforeDeleteHook = async ({
  id,
  req,
  context,
}) => {
  // Same exemptions as above. A listing always has an id, so the clearing one
  // applies here whenever it was asked for.
  if (isClearingListings(context, id)) return
  if (await isTeardownOfBatch(req, context, id)) return

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
