import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('./branches', async () => ({
  runInTransaction: (await import('./place-submission-fake')).runInFakeTransaction,
}))
vi.mock('./partner-lock', async () => ({
  advisoryLock: (await import('./place-submission-fake')).fakeAdvisoryLock,
  placeSubmissionLockKey: (id: number | string) => `lock-${id}`,
}))

import { reportError } from './report'
import { bindFakeLog, fakePayload } from './place-submission-fake'
import { abandonIncomplete } from './place-abandon'

interface Row {
  submission: { status: string; reference: string }
  listingNumber: number | null
  heroImage: unknown
  logo: unknown
  gallery: unknown[]
}
const NOW = new Date('2026-11-23T12:00:00.000Z')
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()
const ahead = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()

const business = (id: number, status: string, over: Record<string, unknown> = {}) => ({
  id,
  listingNumber: 10 + id,
  heroImage: id * 100,
  logo: id * 100 + 1,
  gallery: [id * 100 + 2],
  submission: { status, reference: `VD-${id}` },
  ...over,
})
const session = (id: number, businessId: number, over: Record<string, unknown> = {}) => ({
  id,
  tokenHash: `h${id}`,
  business: businessId,
  expiresAt: ahead(60),
  updatedAt: ago(1),
  // The phone upload made the hero and the logo (the gallery is not the form's).
  mediaIds: [businessId * 100, businessId * 100 + 1],
  ...over,
})
const media = (...ids: number[]) => ids.map((id) => ({ id }))

beforeEach(() => vi.mocked(reportError).mockClear())

describe('abandonIncomplete', () => {
  it('abandons an incomplete form idle past the hold: number freed, photos deleted, session closed', async () => {
    const f = fakePayload({
      businesses: [business(1, 'incomplete')],
      'place-upload-sessions': [session(1, 1, { updatedAt: ago(31) })],
      media: media(100, 101, 102),
    })
    const r = await abandonIncomplete({ payload: f.payload, now: NOW })
    expect(r).toEqual({ abandoned: 1, skipped: 0, mediaDeleted: 2, failed: 0, mediaFailed: 0 })
    const b = f.row('businesses') as unknown as Row
    expect(b.submission.status).toBe('abandoned')
    expect(b.submission.reference).toBe('VD-1')
    expect(b.listingNumber).toBeNull()
    expect(b.heroImage).toBeNull()
    expect(b.logo).toBeNull()
    // Only the two the session created are deleted; the gallery image stays.
    expect(f.tables.media!.map((m) => m.id)).toEqual([102])
    expect(f.row('place-upload-sessions').closedAt).toBe(NOW.toISOString())
  })

  it('deletes ONLY the media recorded on the session: a staff-attached library image survives and stays on the listing', async () => {
    const f = fakePayload({
      // The hero is a library image staff attached (not in mediaIds); the logo came from the phone.
      businesses: [business(1, 'incomplete', { heroImage: 900 })],
      'place-upload-sessions': [session(1, 1, { updatedAt: ago(31), mediaIds: [101] })],
      media: media(900, 101),
    })
    const r = await abandonIncomplete({ payload: f.payload, now: NOW })
    expect(r).toMatchObject({ abandoned: 1, mediaDeleted: 1 })
    expect(f.tables.media!.map((m) => m.id)).toEqual([900])
    const b = f.row('businesses') as unknown as Row
    expect(b.heroImage).toBe(900)
    expect(b.logo).toBeNull()
  })

  it('a session that recorded no media deletes none, whatever the listing points at', async () => {
    const f = fakePayload({
      businesses: [business(1, 'incomplete')],
      'place-upload-sessions': [session(1, 1, { updatedAt: ago(31), mediaIds: undefined })],
      media: media(100, 101, 102),
    })
    const r = await abandonIncomplete({ payload: f.payload, now: NOW })
    expect(r).toMatchObject({ abandoned: 1, mediaDeleted: 0 })
    expect(f.tables.media).toHaveLength(3)
  })

  it('abandons when the session has expired even if recently active', async () => {
    const f = fakePayload({
      businesses: [business(1, 'incomplete')],
      'place-upload-sessions': [session(1, 1, { expiresAt: ago(1), updatedAt: ago(1) })],
    })
    expect((await abandonIncomplete({ payload: f.payload, now: NOW })).abandoned).toBe(1)
  })

  it('uses the hold from Settings', async () => {
    const f = fakePayload({
      businesses: [business(1, 'incomplete')],
      'place-upload-sessions': [session(1, 1, { updatedAt: ago(31) })],
    })
    f.settings.value = { magazinePlaces: { holdMinutes: 60 } }
    expect((await abandonIncomplete({ payload: f.payload, now: NOW })).abandoned).toBe(0)
  })

  it('leaves a fresh incomplete form alone', async () => {
    const f = fakePayload({
      businesses: [business(1, 'incomplete')],
      'place-upload-sessions': [session(1, 1, { updatedAt: ago(29) })],
      media: media(100),
    })
    expect(await abandonIncomplete({ payload: f.payload, now: NOW })).toEqual({
      abandoned: 0,
      skipped: 0,
      mediaDeleted: 0,
      failed: 0,
      mediaFailed: 0,
    })
    expect(f.row('businesses').submission).toMatchObject({ status: 'incomplete' })
    expect(f.row('businesses').listingNumber).toBe(11)
    expect(f.tables.media).toHaveLength(1)
  })

  it('never touches pending, accepted, approved or rejected businesses, even with a stale open session', async () => {
    const statuses = ['pending', 'accepted', 'approved', 'rejected', 'lapsed']
    const f = fakePayload({
      businesses: statuses.map((s, i) => business(i + 1, s)),
      'place-upload-sessions': statuses.map((_, i) =>
        session(i + 1, i + 1, { updatedAt: ago(500) }),
      ),
      media: media(100, 101, 102),
    })
    const r = await abandonIncomplete({ payload: f.payload, now: NOW })
    expect(r.abandoned).toBe(0)
    statuses.forEach((s, i) => {
      expect(f.row('businesses', i).submission).toMatchObject({ status: s })
      expect(f.row('businesses', i).listingNumber).toBe(11 + i)
      expect(f.row('businesses', i).heroImage).toBe((i + 1) * 100)
    })
    expect(f.tables.media).toHaveLength(3)
  })

  it('is safe to run twice', async () => {
    const f = fakePayload({
      businesses: [business(1, 'incomplete')],
      'place-upload-sessions': [session(1, 1, { updatedAt: ago(60) })],
      media: media(100, 101, 102),
    })
    await abandonIncomplete({ payload: f.payload, now: NOW })
    const second = await abandonIncomplete({ payload: f.payload, now: NOW })
    expect(second).toEqual({ abandoned: 0, skipped: 0, mediaDeleted: 0, failed: 0, mediaFailed: 0 })
  })

  it('one failing business does not stop the others, and is reported', async () => {
    const f = fakePayload({
      businesses: [business(1, 'incomplete'), business(2, 'incomplete')],
      'place-upload-sessions': [
        session(1, 1, { updatedAt: ago(60) }),
        session(2, 2, { updatedAt: ago(60) }),
      ],
      media: media(100, 101, 102, 200, 201, 202),
    })
    f.failUpdate.add('businesses:1')
    const r = await abandonIncomplete({ payload: f.payload, now: NOW })
    expect(r).toMatchObject({ abandoned: 1, failed: 1 })
    expect(f.row('businesses').submission).toMatchObject({ status: 'incomplete' })
    expect(f.row('businesses', 1).submission).toMatchObject({ status: 'abandoned' })
    // The failed one keeps its photos and its open session, to be retried.
    expect((f.tables.media ?? []).map((m) => m.id)).toEqual([100, 101, 102, 202])
    expect(f.row('place-upload-sessions').closedAt).toBeUndefined()
    expect(reportError).toHaveBeenCalled()
  })

  it('a photo that cannot be deleted is counted and reported, the rest still go', async () => {
    const f = fakePayload({
      businesses: [business(1, 'incomplete')],
      'place-upload-sessions': [session(1, 1, { updatedAt: ago(60) })],
      media: media(100, 101, 102),
    })
    f.failDelete.add('media:100')
    const r = await abandonIncomplete({ payload: f.payload, now: NOW })
    expect(r).toEqual({ abandoned: 1, skipped: 0, mediaDeleted: 1, failed: 0, mediaFailed: 1 })
    expect((f.tables.media ?? []).map((m) => m.id)).toEqual([100, 102])
  })

  it('takes the submission lock before it re-reads, and leaves a form that finished meanwhile alone', async () => {
    const f = fakePayload({
      businesses: [business(1, 'incomplete')],
      'place-upload-sessions': [session(1, 1, { updatedAt: ago(60) })],
      media: media(100, 101, 102),
    })
    bindFakeLog(f)
    // The finish lands after the stale list was read but before the lock is
    // granted: it is what the re-read under the lock must see.
    const find = f.payload.find.bind(f.payload)
    vi.spyOn(f.payload, 'find').mockImplementation(async (args) => {
      const listed = await find(args)
      f.row('businesses').submission = { status: 'pending', reference: 'VD-1' }
      f.row('place-upload-sessions').closedAt = NOW.toISOString()
      return listed
    })
    const r = await abandonIncomplete({ payload: f.payload, now: NOW })
    expect(r).toMatchObject({ abandoned: 0, skipped: 1, mediaDeleted: 0, failed: 0 })
    const lock = f.log.indexOf('lock:lock-1')
    expect(lock).toBeGreaterThanOrEqual(0)
    expect(f.log.slice(0, lock)).not.toContain('read:businesses')
    expect(f.row('businesses').listingNumber).toBe(11)
    expect(f.row('businesses').heroImage).toBe(100)
    expect(f.tables.media).toHaveLength(3)
  })

  it('does not delete media when the claim failed', async () => {
    const f = fakePayload({
      businesses: [business(1, 'incomplete')],
      'place-upload-sessions': [session(1, 1, { updatedAt: ago(60) })],
      media: media(100, 101, 102),
    })
    f.failUpdate.add('place-upload-sessions:1')
    const r = await abandonIncomplete({ payload: f.payload, now: NOW })
    expect(r).toMatchObject({ abandoned: 0, failed: 1, mediaDeleted: 0 })
    expect(f.tables.media).toHaveLength(3)
  })

  it('closes the session and counts it skipped when the business no longer exists', async () => {
    const f = fakePayload({
      businesses: [],
      'place-upload-sessions': [session(1, 99, { updatedAt: ago(60) })],
    })
    const r = await abandonIncomplete({ payload: f.payload, now: NOW })
    expect(r).toMatchObject({ abandoned: 0, skipped: 1, failed: 0 })
    expect(f.row('place-upload-sessions').closedAt).toBe(NOW.toISOString())
    // And it is not found again.
    expect((await abandonIncomplete({ payload: f.payload, now: NOW })).skipped).toBe(0)
  })

  it('leaves a session alone that was touched after the list was read (activity keeps it alive)', async () => {
    const f = fakePayload({
      businesses: [business(1, 'incomplete')],
      'place-upload-sessions': [session(1, 1, { updatedAt: ago(60) })],
      media: media(100, 101, 102),
    })
    const find = f.payload.find.bind(f.payload)
    vi.spyOn(f.payload, 'find').mockImplementation(async (args) => {
      const listed = await find(args)
      f.row('place-upload-sessions').updatedAt = ago(1)
      return listed
    })
    const r = await abandonIncomplete({ payload: f.payload, now: NOW })
    expect(r).toMatchObject({ abandoned: 0, skipped: 1 })
    expect(f.row('businesses').submission).toMatchObject({ status: 'incomplete' })
    expect(f.row('place-upload-sessions').closedAt).toBeUndefined()
    expect(f.tables.media).toHaveLength(3)
  })

  it('a session active a minute ago but past its hard cap is abandoned', async () => {
    const f = fakePayload({
      businesses: [business(1, 'incomplete')],
      'place-upload-sessions': [session(1, 1, { updatedAt: ago(1), expiresAt: ago(1) })],
    })
    expect((await abandonIncomplete({ payload: f.payload, now: NOW })).abandoned).toBe(1)
  })
})
