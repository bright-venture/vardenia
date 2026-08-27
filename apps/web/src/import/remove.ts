import type { Payload } from 'payload'

/**
 * Removes an entire import, including codes that would normally be undeletable.
 *
 * # Why this exists
 *
 * The Keserwan import is a demo. Real listings are permanent by design - a
 * printed QR code cannot be recalled, so `protectPrintedCodes` refuses to delete
 * a code that has been scanned or put into an issue. That rule is right, and it
 * is also exactly what would strand a demo: somebody on the team scans one code
 * to show it working, and that row can never be cleaned up.
 *
 * So this is allowed through the guard, and the permission is deliberately not
 * "the caller asked nicely". The hook re-reads the listing and lets the delete
 * proceed only when the listing itself carries the batch being removed. A
 * listing a person created has an empty `importBatch` and cannot be reached this
 * way at all.
 *
 * # Order matters
 *
 * Codes first, then the listing. Deleting the listing first leaves the code
 * pointing at nothing, and the guard would then have no listing to read the
 * batch from - so the code would be permanently undeletable, which is the
 * opposite of the point.
 */

export interface RemoveResult {
  batch: string
  listings: number
  codes: number
  /** Anything that refused to go, with the reason. */
  failures: { what: string; error: string }[]
}

/** Payload returns a relationship as an id or as a populated document. */
const relationId = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) {
    return (value as { id: string | number }).id
  }
  return null
}

export async function removeImport(
  payload: Payload,
  batch: string,
  options: { dryRun?: boolean } = {},
): Promise<RemoveResult> {
  const result: RemoveResult = { batch, listings: 0, codes: 0, failures: [] }

  if (!batch.trim()) {
    // An empty batch would match every listing whose importBatch is unset,
    // which is every listing a person ever created.
    throw new Error('removeImport needs a batch name. Refusing to run with an empty one.')
  }

  const businesses = await payload.find({
    collection: 'businesses',
    where: { importBatch: { equals: batch } },
    limit: 1000,
    depth: 0,
    draft: true,
    overrideAccess: true,
  })

  for (const business of businesses.docs) {
    const codes = await payload.find({
      collection: 'qr-codes',
      where: { business: { equals: business.id } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })

    if (options.dryRun) {
      result.listings += 1
      result.codes += codes.docs.length
      continue
    }

    let codesGone = true

    for (const code of codes.docs) {
      try {
        await payload.delete({
          collection: 'qr-codes',
          id: code.id,
          overrideAccess: true,
          // Read by hooks/protectPrintedCodes, which verifies it against the
          // listing's own importBatch before allowing anything.
          context: { importTeardown: batch },
        })

        result.codes += 1
      } catch (error) {
        codesGone = false
        result.failures.push({
          what: `code ${String((code as { code?: string }).code ?? code.id)}`,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    /**
     * A listing whose code refused to go is left alone on purpose. Deleting it
     * anyway would orphan that code and take away the only route to removing it
     * later, since the guard reads the batch off the listing.
     */
    if (!codesGone) continue

    try {
      await payload.delete({
        collection: 'businesses',
        id: business.id,
        overrideAccess: true,
        context: { importTeardown: batch },
      })

      result.listings += 1
    } catch (error) {
      result.failures.push({
        what: `listing ${String((business as { name?: string }).name ?? business.id)}`,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

/** What a batch currently holds, without touching anything. */
export async function describeImport(payload: Payload, batch: string) {
  const businesses = await payload.find({
    collection: 'businesses',
    where: { importBatch: { equals: batch } },
    limit: 1000,
    depth: 1,
    draft: true,
    overrideAccess: true,
  })

  const withCode = businesses.docs.filter((doc) => relationId((doc as { qrCode?: unknown }).qrCode))
  const published = businesses.docs.filter(
    (doc) => (doc as { _status?: string })._status === 'published',
  )

  return {
    batch,
    listings: businesses.totalDocs,
    withCode: withCode.length,
    published: published.length,
  }
}
