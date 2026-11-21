import type { PayloadRequest } from 'payload'

/**
 * Keeps `brands.published` true exactly while a brand has at least one
 * published listing that is not in the trash (Task 9). Public reads of brands
 * filter on that flag (collections/Brands brandsRead).
 *
 * Runs after every listing save (afterChange) and permanent delete
 * (afterDelete). Moving to the trash and restoring are saves (Payload writes
 * `deletedAt`), so they come through afterChange. Only a save that changes
 * the listing's status, trash state or brand recounts; then each brand
 * touched (the old one and the new one) is recounted from the database, on
 * the save's own `req` so it joins its transaction, and written only when
 * the flag is wrong. A count, not an increment: a missed event is corrected
 * by the next save of any of the brand's listings.
 *
 * lib/contract-lapse unpublishes through payload.update, so a lapse is seen
 * here too. A raw SQL write to `_status` would not be: there is none today.
 */

const idOf = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

type Listing = { brand?: unknown; _status?: unknown; deletedAt?: unknown } | null | undefined

interface Args {
  doc: Listing
  previousDoc?: Listing
  operation?: 'create' | 'update'
  req: PayloadRequest
}

const trashed = (listing: Listing) => Boolean(listing?.deletedAt)

export async function syncBrandPublished(args: Args): Promise<Listing> {
  const { doc, previousDoc, operation, req } = args
  const isDelete = operation === undefined
  const now = idOf(doc?.brand)
  const before = idOf(previousDoc?.brand)

  const relevant =
    isDelete ||
    operation === 'create' ||
    now !== before ||
    doc?._status !== previousDoc?._status ||
    trashed(doc) !== trashed(previousDoc)
  if (!relevant) return doc

  const brands = [...new Set([now, before].filter((id): id is number | string => id !== null))]
  for (const brand of brands) {
    const { totalDocs } = await req.payload.count({
      collection: 'businesses',
      where: { and: [{ brand: { equals: brand } }, { _status: { equals: 'published' } }] },
      overrideAccess: true,
      req,
    })
    const published = totalDocs > 0
    // `find`, not `findByID`: a missing brand is an empty answer here, never
    // an error that would roll back the save's transaction.
    const found = await req.payload.find({
      collection: 'brands',
      where: { id: { equals: brand } },
      select: { published: true },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const current = found.docs[0] as { published?: unknown } | undefined
    if (!current || Boolean(current.published) === published) continue
    await req.payload.update({
      collection: 'brands',
      id: brand,
      data: { published },
      depth: 0,
      overrideAccess: true,
      req,
    })
  }
  return doc
}
