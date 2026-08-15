import type { CollectionAfterChangeHook } from 'payload'
import { DEFAULT_PLACEMENT, generateCode } from '@vardenia/core'

const MAX_ATTEMPTS = 5

/**
 * Guarantees every listing owns a QR code from the moment it exists.
 *
 * Sales works to print deadlines; nobody should discover at the layout stage
 * that half the listings have no code. Codes are cheap, so we mint one eagerly
 * and never revoke it.
 */
export const ensureQrCode: CollectionAfterChangeHook = async ({ doc, req, context }) => {
  // The link-back update below re-triggers this hook; this flag stops the loop.
  if (context.skipQrGeneration) return doc
  if (doc.qrCode) return doc

  const { payload } = req

  /**
   * Adopt an existing code before minting a new one.
   *
   * `doc.qrCode` was the only guard, which asks "does this listing point at a
   * code" rather than "does a code point at this listing" - and those come
   * apart. Minting happens in two steps: create the code, then update the
   * listing to reference it. If the second step fails, and a dropped connection
   * to the database is enough, the code exists and the listing does not know
   * about it. The next save then minted a second code for the same listing.
   *
   * That was reproduced: clearing the relationship produced AXGRDH2 alongside
   * AASBVQR, both pointing at one listing, with nothing to say which was real.
   * If the first is already printed, the second is a decoy that will appear on
   * the print sheet next to it.
   *
   * Oldest first, deliberately. The earliest code is the one most likely to be
   * on paper already, and paper cannot be corrected.
   */
  const orphaned = await payload.find({
    collection: 'qr-codes',
    where: { business: { equals: doc.id } },
    limit: 1,
    depth: 0,
    sort: 'createdAt',
    overrideAccess: true,
  })

  const existing = orphaned.docs[0]
  if (existing) {
    await payload.update({
      collection: 'businesses',
      id: doc.id,
      data: { qrCode: existing.id },
      req,
      context: { skipQrGeneration: true },
    })

    payload.logger.info(
      { businessId: doc.id, code: (existing as { code?: string }).code },
      'Relinked an existing QR code rather than minting a second one',
    )

    return { ...doc, qrCode: existing.id }
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateCode()

    const existing = await payload.find({
      collection: 'qr-codes',
      where: { code: { equals: code } },
      limit: 1,
      depth: 0,
    })
    if (existing.totalDocs > 0) continue // Astronomically unlikely; handled anyway.

    const created = await payload.create({
      collection: 'qr-codes',
      data: {
        code,
        targetType: 'business',
        business: doc.id,
        // Codes exist to be printed. Minting one as 'digital' described a surface
        // that does not exist and quietly hid the issue field behind a condition.
        placement: DEFAULT_PLACEMENT,
        active: true,
      },
      req,
    })

    await payload.update({
      collection: 'businesses',
      id: doc.id,
      data: { qrCode: created.id },
      req,
      context: { skipQrGeneration: true },
    })

    return { ...doc, qrCode: created.id }
  }

  payload.logger.error(
    { businessId: doc.id },
    'Could not allocate a unique QR code after several attempts',
  )
  return doc
}
