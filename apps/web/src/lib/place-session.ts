import type { Payload, PayloadRequest } from 'payload'

import { runInTransaction } from './branches'
import { advisoryLock, placeSubmissionLockKey } from './partner-lock'
import { getPlaceSettings } from './place-settings'

/**
 * When is a phone upload session of the Magazine Places form alive?
 *
 * Two clocks, one rule, shared by finish, abandon and the upload step so they
 * can never disagree:
 *
 *  - IDLE: the session is dead once `updatedAt` is older than `holdMinutes`
 *    (Settings, 30 by default). Payload moves `updatedAt` on every write to the
 *    row, so any activity (touchPlaceSession, an upload marking logoReceived)
 *    keeps it alive: a photo sent at minute 29 means the owner can still
 *    finish at minute 31.
 *  - HARD CAP: `expiresAt` is an absolute end, set to the start plus
 *    PLACE_SESSION_HARD_CAP_HOURS (24). Activity never extends it. It is also
 *    what the browser is told ("expiresAt"): the latest the link can work, not
 *    the idle time-out.
 *
 * A closed session (`closedAt`) is dead for everything but the replay of a
 * finish that already succeeded.
 */

export const PLACE_SESSION_HARD_CAP_HOURS = 24

export interface SessionClock {
  expiresAt: string
  updatedAt?: string | null
  createdAt?: string | null
  closedAt?: string | null
}

export type SessionLife = 'live' | 'closed' | 'expired' | 'idle'

export function placeSessionLife(
  session: SessionClock,
  holdMinutes: number,
  now: Date,
): SessionLife {
  if (session.closedAt) return 'closed'
  if (new Date(session.expiresAt).getTime() <= now.getTime()) return 'expired'
  const last = session.updatedAt ?? session.createdAt
  if (last && new Date(last).getTime() < now.getTime() - holdMinutes * 60_000) return 'idle'
  return 'live'
}

/** The absolute end of a session started at `now`. */
export const hardCapFrom = (now: Date) =>
  new Date(now.getTime() + PLACE_SESSION_HARD_CAP_HOURS * 3_600_000).toISOString()

/**
 * Records activity on a session, so its idle clock restarts. The phone upload
 * step calls this for every request it accepts. It takes the submission's lock
 * (the same key as finish and abandon) and writes the row, so a touch cannot
 * interleave with a finish or an abandon in progress. It revives nothing: after
 * the lock it re-reads the session and its business and returns false (writing
 * nothing) unless the session is `live` by placeSessionLife (not closed, not
 * idle past holdMinutes, not past the hard cap) and the business is still
 * `incomplete`. An idle session the sweep has not reached yet therefore cannot
 * be brought back to life by a late touch.
 *
 * Pass `req` when already inside a transaction (the lock is then simply held
 * longer); without it the call is its own transaction.
 */
export async function touchPlaceSession(args: {
  payload: Payload
  sessionId: number
  req?: PayloadRequest
  now?: Date
}): Promise<boolean> {
  const { payload, sessionId } = args
  const now = args.now ?? new Date()

  const work = async (req: PayloadRequest | undefined) => {
    const session = (await payload
      .findByID({
        collection: 'place-upload-sessions',
        id: sessionId,
        depth: 0,
        ...(req ? { req } : {}),
        overrideAccess: true,
      })
      .catch(() => null)) as unknown as { business: unknown; closedAt?: string | null } | null
    if (!session) return false
    const business =
      typeof session.business === 'object'
        ? (session.business as { id: number }).id
        : (session.business as number)
    if (req) await advisoryLock(req, placeSubmissionLockKey(business))

    const fresh = (await payload
      .findByID({
        collection: 'place-upload-sessions',
        id: sessionId,
        depth: 0,
        ...(req ? { req } : {}),
        overrideAccess: true,
      })
      .catch(() => null)) as unknown as SessionClock | null
    if (!fresh) return false
    const settings = await getPlaceSettings(payload, req)
    if (placeSessionLife(fresh, settings.holdMinutes, now) !== 'live') return false

    const owner = (await payload
      .findByID({
        collection: 'businesses',
        id: business,
        depth: 0,
        ...(req ? { req } : {}),
        overrideAccess: true,
      })
      .catch(() => null)) as unknown as { submission?: { status?: string } } | null
    if (owner?.submission?.status !== 'incomplete') return false

    await payload.update({
      collection: 'place-upload-sessions',
      id: sessionId,
      data: { updatedAt: now.toISOString() },
      depth: 0,
      ...(req ? { req } : {}),
      overrideAccess: true,
    })
    return true
  }

  if (args.req) return work(args.req)
  return runInTransaction(payload, (req) => work(req as unknown as PayloadRequest))
}
