import type { CollectionSlug, Payload } from 'payload'

/**
 * Signs an account out of every device except one (21 November 2026).
 *
 * A password change already does this through Payload, which keeps only the
 * session making the change. An email change does not touch the password, so
 * nothing signed the other devices out, although the email decides who gets the
 * reset links. This makes the same write Payload's own logout does: the row read
 * through the adapter, its sessions filtered, written back without touching
 * updatedAt.
 *
 * `keep` is the current session id (`user._sid`). Without one, every session
 * goes, which errs on the safe side.
 */
export async function revokeOtherSessions(
  payload: Payload,
  collection: CollectionSlug,
  id: number | string,
  keep: string | undefined,
): Promise<number> {
  const row = await payload.db.findOne<
    { id: number | string; sessions?: { id?: string }[] } & Record<string, unknown>
  >({
    collection,
    where: { id: { equals: id } },
  })
  if (!row) return 0

  const sessions = Array.isArray(row.sessions) ? row.sessions : []
  const kept = keep ? sessions.filter((session) => session?.id === keep) : []
  const removed = sessions.length - kept.length
  if (removed === 0) return 0

  await payload.db.updateOne({
    collection,
    id,
    data: { ...row, sessions: kept, updatedAt: null },
    returning: false,
  })
  return removed
}
