import type { CollectionAfterChangeHook } from 'payload'
import { generateCode } from '@vardenia/core'

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
        placement: 'digital',
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
