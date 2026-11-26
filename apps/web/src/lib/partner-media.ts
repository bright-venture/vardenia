import { APIError, type PayloadRequest } from 'payload'
import type { Id } from './field-shape'

const idOf = (value: unknown): Id | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

/**
 * A partner may attach only media they uploaded themselves.
 *
 * `ids` are the media a partner's write names; `alreadyOn` the media the
 * document points at now. Whatever is already there may stay or move (a team
 * photo from the gallery to the hero), so a partner can save a listing the team
 * illustrated. Anything new must be a media row whose `uploadedBy` is this
 * partner: another partner's upload, a team upload from the library, or an id
 * that does not exist are all refused the same way, without saying which.
 *
 * One query, for the new ids only, so an ordinary edit costs nothing.
 */
export async function assertOwnMedia({
  req,
  partnerId,
  ids,
  alreadyOn,
}: {
  req: PayloadRequest
  partnerId: Id
  ids: Id[]
  alreadyOn: Id[]
}): Promise<void> {
  const present = new Set(alreadyOn.map(String))
  const fresh = [...new Set(ids.map(String))].filter((id) => !present.has(id))
  if (fresh.length === 0) return

  const found = await req.payload.find({
    collection: 'media',
    where: { id: { in: fresh } },
    select: { uploadedBy: true },
    depth: 0,
    limit: fresh.length,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const uploader = new Map(
    found.docs.map((doc) => [
      String((doc as { id: Id }).id),
      idOf((doc as { uploadedBy?: unknown }).uploadedBy),
    ]),
  )

  for (const id of fresh) {
    const by = uploader.get(id)
    if (by === undefined || by === null || String(by) !== String(partnerId)) {
      throw new APIError(
        'You can only use photos and files you uploaded yourself. Upload it first, then choose it.',
        403,
        null,
        true,
      )
    }
  }
}
