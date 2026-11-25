import type { Payload } from 'payload'

import { runInTransaction } from './branches'
import { placeSessionLife, type SessionClock } from './place-session'
import { advisoryLock, placeSubmissionLockKey } from './partner-lock'
import { getPlaceSettings } from './place-settings'
import { mediaIdsOf } from './place-upload'
import { reportError } from './report'

/**
 * Gives up forms that were started and never finished (called every 5 minutes
 * by netlify/functions/abandon-incomplete.mts through POST
 * /booking/abandon-incomplete).
 *
 * A form is unfinished while its business is `incomplete` and its upload
 * session is open. It is given up when
 *
 *  - the session has expired (expiresAt), or
 *  - the session has seen no activity for `holdMinutes` (Settings).
 *
 * See lib/place-session for the rule (idle on `updatedAt`, plus the 24 hour hard
 * cap in `expiresAt`). "Activity" is the session's `updatedAt`: Payload sets it on every write to
 * the row, so the upload step (a later task) refreshes the hold simply by
 * updating the session (logoReceived / heroReceived); `createdAt` is the
 * starting value, because a new row's updatedAt equals it.
 *
 * Each business gets one transaction, under the submission's advisory lock
 * (shared with finish; everything is re-read inside it), that sets submission.status `abandoned`
 * (the releaseListingNumber hook frees the number in that same write), takes
 * the session's own photos off the listing and closes the session. Only the
 * media ids the session recorded (`mediaIds`, written by the phone upload in
 * lib/place-upload) are ever deleted: an image staff attached from the library
 * is neither cleared nor deleted. The photo files are
 * deleted right after it commits, since a file delete cannot be rolled back.
 * Only `incomplete` is ever touched: pending, accepted and later states never
 * are, and a second run finds nothing. One business failing does not stop the
 * others.
 */

export interface AbandonResult {
  abandoned: number
  /** Stale sessions closed without touching a business (gone, or no longer incomplete). */
  skipped: number
  mediaDeleted: number
  /** Businesses that could not be abandoned (retried on the next run). */
  failed: number
  /** Photos that could not be deleted after their business was abandoned. */
  mediaFailed: number
}

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' ? id : null
}

export async function abandonIncomplete(args: {
  payload: Payload
  now?: Date
}): Promise<AbandonResult> {
  const { payload } = args
  const now = args.now ?? new Date()
  const settings = await getPlaceSettings(payload)
  const idleBefore = new Date(now.getTime() - settings.holdMinutes * 60_000).toISOString()

  const open = await payload.find({
    collection: 'place-upload-sessions',
    where: {
      and: [
        { closedAt: { exists: false } },
        {
          or: [
            { expiresAt: { less_than: now.toISOString() } },
            { updatedAt: { less_than: idleBefore } },
          ],
        },
      ],
    },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  const result: AbandonResult = {
    abandoned: 0,
    skipped: 0,
    mediaDeleted: 0,
    failed: 0,
    mediaFailed: 0,
  }

  for (const session of open.docs as unknown as Array<{ id: number; business: unknown }>) {
    const businessId = idOf(session.business)
    try {
      if (businessId === null) throw new Error('session has no business')
      const closedAt = now.toISOString()

      // Everything is decided under the submission's lock (finish takes the
      // same one) from a fresh read, so a finish that landed since the list
      // above is never overwritten: its session is closed and its status is
      // no longer incomplete, and this run leaves it alone.
      const outcome = await runInTransaction(payload, async (req) => {
        await advisoryLock(req, placeSubmissionLockKey(businessId))

        const fresh = (await payload
          .findByID({
            collection: 'place-upload-sessions',
            id: session.id,
            depth: 0,
            req,
            overrideAccess: true,
          })
          .catch(() => null)) as unknown as SessionClock | null
        if (!fresh) return { kind: 'skipped' as const }
        // Closed by a finish meanwhile, or touched since the list was read
        // (placeSessionLife is the rule finish uses): leave it alone.
        const own = mediaIdsOf((fresh as { mediaIds?: unknown }).mediaIds)
        const life = placeSessionLife(fresh, settings.holdMinutes, now)
        if (life === 'closed' || life === 'live') return { kind: 'skipped' as const }

        const business = (await payload
          .findByID({
            collection: 'businesses',
            id: businessId,
            depth: 0,
            req,
            overrideAccess: true,
          })
          .catch(() => null)) as unknown as {
          heroImage?: unknown
          logo?: unknown
          submission?: { status?: string }
        } | null

        // Gone, or not an unfinished form any more (finished, rejected, ...):
        // the session is stale. Close it so it is not found again, change
        // nothing else.
        if (!business || business.submission?.status !== 'incomplete') {
          await payload.update({
            collection: 'place-upload-sessions',
            id: session.id,
            data: { closedAt },
            depth: 0,
            req,
            overrideAccess: true,
          })
          return { kind: 'skipped' as const }
        }

        // Only what this session created leaves the listing and is deleted.
        const heroId = idOf(business.heroImage)
        const logoId = idOf(business.logo)
        const clear = {
          ...(heroId !== null && own.includes(heroId) ? { heroImage: null } : {}),
          ...(logoId !== null && own.includes(logoId) ? { logo: null } : {}),
        }

        await payload.update({
          collection: 'businesses',
          id: businessId,
          data: {
            submission: { ...business.submission, status: 'abandoned' },
            ...clear,
          } as never,
          depth: 0,
          req,
          overrideAccess: true,
          context: { skipAutoTranslate: true, skipQrGeneration: true },
        })
        await payload.update({
          collection: 'place-upload-sessions',
          id: session.id,
          data: { closedAt },
          depth: 0,
          req,
          overrideAccess: true,
        })
        return { kind: 'abandoned' as const, mediaIds: own }
      })

      if (outcome.kind === 'skipped') {
        result.skipped++
        continue
      }
      result.abandoned++

      // Only after the claim committed: a file delete cannot be rolled back.
      for (const id of outcome.mediaIds) {
        try {
          await payload.delete({ collection: 'media', id, depth: 0, overrideAccess: true })
          result.mediaDeleted++
        } catch (error) {
          result.mediaFailed++
          await reportError(error, {
            source: 'place-abandon.media',
            level: 'warning',
            extra: { businessId, mediaId: id },
          })
        }
      }
    } catch (error) {
      result.failed++
      await reportError(error, {
        source: 'place-abandon',
        level: 'warning',
        extra: { businessId, sessionId: session.id },
      })
    }
  }
  return result
}
