import type { Payload } from 'payload'
import { DEFAULT_LOCALE } from '@vardenia/i18n'

import { PHOTO_MAX_BYTES } from '../hooks/limitUploadSize'
import { runInTransaction } from './branches'
import { advisoryLock, placeSubmissionLockKey } from './partner-lock'
import { checkPhoto } from './place-photo-check'
import { placeSessionLife, touchPlaceSession, type SessionClock } from './place-session'
import { getPlaceSettings } from './place-settings'
import { hashSessionToken } from './place-submission'
import { reportError } from './report'

/**
 * Step 2 of the Magazine Places form: the owner sends the logo and the main
 * photo from their phone (the QR link), one request per photo.
 *
 * Who may call it is whoever holds the session token. It is looked up by its
 * SHA-256, and an unknown token, a closed, idle or hard-capped session, and a
 * business that is no longer `incomplete` all give the same `not-found`, so the
 * answer says nothing about which one it was. The token is never logged or
 * reported here.
 *
 * Order, so a bad caller learns nothing and a bad file costs nothing:
 *  1. the session and its business, cheaply, without a lock (not-found);
 *  2. the file, by its bytes (lib/place-photo-check): JPEG, PNG or WebP;
 *  3. the media is stored (image processing is slow, so it is outside the lock);
 *  4. ONE transaction: the submission's lock (placeSubmissionLockKey, shared with
 *     finish and abandon), then the session and business are read AGAIN and
 *     placeSessionLife and `status === 'incomplete'` are re-checked before
 *     anything is attached. Only then is the business's `logo` or `heroImage`
 *     set (that one field, nothing else), the session's media ids and flag
 *     written, and the session touched (its idle clock restarts).
 *
 * The media ids this session created are recorded on the session
 * (`mediaIds`). A replaced image is deleted only when it is in that list: a
 * library image staff attached by hand is left alone, and abandon deletes the
 * same list and nothing else. If anything fails after the media was stored it
 * is deleted again, so no failed upload leaves a file behind. Files that live
 * in storage cannot be rolled back, so the replaced one is deleted only after
 * the commit.
 *
 * Media is created with overrideAccess inside this lib code only, usageRights
 * `supplied`, the business name as alt (written in the default locale, which is
 * where the form stores the name whatever language the owner used).
 */

export type PlaceSlot = 'logo' | 'hero'

export type UploadOutcome =
  | { ok: true; slot: PlaceSlot; logoReceived: boolean; heroReceived: boolean }
  | { ok: false; code: 'not-found' }
  | { ok: false; code: 'too-large' | 'bad-file' | 'bad-type'; message: string }
  | { ok: false; code: 'error' }

export type StatusOutcome =
  | { ok: true; logoReceived: boolean; heroReceived: boolean; live: boolean }
  | { ok: false; code: 'not-found' }

type SessionDoc = SessionClock & {
  id: number
  business: unknown
  logoReceived?: boolean | null
  heroReceived?: boolean | null
  mediaIds?: unknown
}

interface BusinessDoc {
  name?: unknown
  logo?: unknown
  heroImage?: unknown
  submission?: { status?: string }
}

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' ? id : null
}

/** The ids recorded on a session, whatever the JSON column holds. */
export const mediaIdsOf = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((id): id is number => typeof id === 'number') : []

const FIELD = { logo: 'logo', hero: 'heroImage' } as const

async function sessionFor(payload: Payload, token: unknown): Promise<SessionDoc | null> {
  if (typeof token !== 'string' || !token || token.length > 200) return null
  const found = await payload.find({
    collection: 'place-upload-sessions',
    where: { tokenHash: { equals: hashSessionToken(token) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return (found.docs[0] as unknown as SessionDoc | undefined) ?? null
}

async function businessOf(payload: Payload, id: number, req?: never): Promise<BusinessDoc | null> {
  return (await payload
    .findByID({
      collection: 'businesses',
      id,
      depth: 0,
      locale: DEFAULT_LOCALE,
      ...(req ? { req } : {}),
      overrideAccess: true,
    })
    .catch(() => null)) as BusinessDoc | null
}

/** Deletes a media row (and its files), reporting instead of throwing. */
async function dropMedia(payload: Payload, id: number, source: string, businessId?: number) {
  try {
    await payload.delete({ collection: 'media', id, depth: 0, overrideAccess: true })
  } catch (error) {
    await reportError(error, {
      source,
      level: 'warning',
      extra: { mediaId: id, ...(businessId ? { businessId } : {}) },
    })
  }
}

export async function attachPlacePhoto(args: {
  payload: Payload
  token: string
  slot: PlaceSlot
  file: File | undefined
  now?: Date
}): Promise<UploadOutcome> {
  const { payload, token, slot } = args
  const now = args.now ?? new Date()
  const notFound = { ok: false, code: 'not-found' } as const
  let mediaId: number | null = null
  let businessId: number | undefined

  try {
    if (slot !== 'logo' && slot !== 'hero') return notFound

    const session = await sessionFor(payload, token)
    if (!session) return notFound
    const settings = await getPlaceSettings(payload)
    if (placeSessionLife(session, settings.holdMinutes, now) !== 'live') return notFound
    businessId = idOf(session.business) ?? undefined
    if (businessId === undefined) return notFound
    const peek = await businessOf(payload, businessId)
    if (!peek || peek.submission?.status !== 'incomplete') return notFound

    // The file, by its bytes. Size first, so a huge file is not read.
    const file = args.file
    if (file && file.size > PHOTO_MAX_BYTES) {
      return {
        ok: false,
        code: 'too-large',
        message: `The photo is over ${PHOTO_MAX_BYTES / (1024 * 1024)} MB. Please choose a smaller one.`,
      }
    }
    const label = slot === 'logo' ? 'logo' : 'main'
    const checked = await checkPhoto(file, label)
    if (typeof checked === 'string') {
      const bad = !file || file.size === 0
      return { ok: false, code: bad ? 'bad-file' : 'bad-type', message: checked }
    }

    const created = await payload.create({
      collection: 'media',
      data: {
        alt: String(peek.name ?? ''),
        usageRights: 'supplied',
        attached: false,
      } as never,
      file: {
        data: checked.data,
        mimetype: checked.mimetype,
        name: checked.name,
        size: checked.size,
      },
      locale: DEFAULT_LOCALE,
      depth: 0,
      overrideAccess: true,
    })
    mediaId = created.id as number
    const storedId = mediaId
    const owner = businessId

    const done = await runInTransaction(payload, async (req) => {
      await advisoryLock(req, placeSubmissionLockKey(owner))

      // Everything is decided again from a fresh read, under the lock.
      const fresh = (await payload
        .findByID({
          collection: 'place-upload-sessions',
          id: session.id,
          depth: 0,
          req,
          overrideAccess: true,
        })
        .catch(() => null)) as unknown as SessionDoc | null
      if (!fresh || placeSessionLife(fresh, settings.holdMinutes, now) !== 'live') {
        return { kind: 'not-found' as const }
      }
      const business = await businessOf(payload, owner, req as never)
      if (!business || business.submission?.status !== 'incomplete') {
        return { kind: 'not-found' as const }
      }

      // Restarts the idle clock; it checks session life and status itself.
      if (!(await touchPlaceSession({ payload, sessionId: session.id, req, now }))) {
        return { kind: 'not-found' as const }
      }

      const field = FIELD[slot]
      const previous = idOf(business[field])
      const own = mediaIdsOf(fresh.mediaIds)
      // A replaced image goes only if this session made it.
      const dropPrevious = previous !== null && own.includes(previous) ? previous : null

      await payload.update({
        collection: 'businesses',
        id: owner,
        data: { [field]: storedId } as never,
        depth: 0,
        req,
        overrideAccess: true,
        context: { skipAutoTranslate: true, skipQrGeneration: true },
      })

      const flags = {
        logoReceived: slot === 'logo' ? true : Boolean(fresh.logoReceived),
        heroReceived: slot === 'hero' ? true : Boolean(fresh.heroReceived),
      }
      await payload.update({
        collection: 'place-upload-sessions',
        id: session.id,
        data: {
          mediaIds: [...own.filter((id) => id !== dropPrevious), storedId],
          ...flags,
        } as never,
        depth: 0,
        req,
        overrideAccess: true,
      })
      return { kind: 'ok' as const, dropPrevious, ...flags }
    })

    if (done.kind === 'not-found') {
      await dropMedia(payload, storedId, 'place-upload.orphan', owner)
      return notFound
    }
    // Only after the commit: a file delete cannot be rolled back.
    if (done.dropPrevious !== null) {
      await dropMedia(payload, done.dropPrevious, 'place-upload.replaced', owner)
    }
    mediaId = null
    return {
      ok: true,
      slot,
      logoReceived: done.logoReceived,
      heroReceived: done.heroReceived,
    }
  } catch (error) {
    // Never leave an orphan: whatever failed after the media was stored.
    if (mediaId !== null) await dropMedia(payload, mediaId, 'place-upload.orphan', businessId)
    await reportError(error, { source: 'place-upload', extra: { slot } })
    return { ok: false, code: 'error' }
  }
}

/**
 * What the big screen polls: whether each photo has arrived and whether the
 * session is still usable. No private data, no write (it does not keep the
 * session alive: only the phone does). An unknown token, or a session that is
 * closed or whose business moved on, is the same `not-found`; an idle or
 * hard-capped one is reported `live: false` only while the form is still
 * unfinished, so the screen can say "start again".
 */
export async function placeSessionStatus(args: {
  payload: Payload
  token: string
  now?: Date
}): Promise<StatusOutcome> {
  const { payload, token } = args
  const now = args.now ?? new Date()
  const notFound = { ok: false, code: 'not-found' } as const
  try {
    const session = await sessionFor(payload, token)
    if (!session) return notFound
    const settings = await getPlaceSettings(payload)
    const life = placeSessionLife(session, settings.holdMinutes, now)
    if (life === 'closed') return notFound
    const businessId = idOf(session.business)
    if (businessId === null) return notFound
    const business = await businessOf(payload, businessId)
    if (!business || business.submission?.status !== 'incomplete') return notFound
    return {
      ok: true,
      logoReceived: Boolean(session.logoReceived),
      heroReceived: Boolean(session.heroReceived),
      live: life === 'live',
    }
  } catch (error) {
    await reportError(error, { source: 'place-upload.status' })
    return notFound
  }
}
