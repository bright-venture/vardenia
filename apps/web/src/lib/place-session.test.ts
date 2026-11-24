import { describe, expect, it, vi } from 'vitest'

vi.mock('./branches', async () => ({
  runInTransaction: (await import('./place-submission-fake')).runInFakeTransaction,
}))
vi.mock('./partner-lock', async () => ({
  advisoryLock: (await import('./place-submission-fake')).fakeAdvisoryLock,
  placeSubmissionLockKey: (id: number | string) => `lock-${id}`,
}))

import { bindFakeLog, fakePayload } from './place-submission-fake'
import { hardCapFrom, placeSessionLife, touchPlaceSession } from './place-session'

const NOW = new Date('2026-11-23T12:00:00.000Z')
const ago = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()
const ahead = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString()

describe('placeSessionLife', () => {
  const base = { expiresAt: ahead(600), updatedAt: ago(1) }
  it('is live while active and inside the hard cap', () => {
    expect(placeSessionLife(base, 30, NOW)).toBe('live')
  })
  it('is idle after holdMinutes without activity, and live again after a touch', () => {
    expect(placeSessionLife({ ...base, updatedAt: ago(31) }, 30, NOW)).toBe('idle')
    expect(placeSessionLife({ ...base, updatedAt: ago(30) }, 30, NOW)).toBe('live')
    expect(placeSessionLife({ ...base, updatedAt: ago(0) }, 30, NOW)).toBe('live')
  })
  it('falls back to createdAt when there is no updatedAt', () => {
    expect(placeSessionLife({ expiresAt: ahead(5), createdAt: ago(45) }, 30, NOW)).toBe('idle')
  })
  it('is expired at the hard cap however recent the activity', () => {
    expect(placeSessionLife({ ...base, expiresAt: ago(0) }, 30, NOW)).toBe('expired')
  })
  it('is closed when closedAt is set, before anything else', () => {
    expect(placeSessionLife({ ...base, closedAt: ago(1), expiresAt: ago(5) }, 30, NOW)).toBe(
      'closed',
    )
  })
  it('the hard cap is 24 hours from the start', () => {
    expect(hardCapFrom(NOW)).toBe('2026-11-24T12:00:00.000Z')
  })
})

describe('touchPlaceSession', () => {
  const world = (over: Record<string, unknown> = {}, status = 'incomplete') =>
    fakePayload({
      businesses: [{ id: 5, submission: { status } }],
      'place-upload-sessions': [
        {
          id: 9,
          business: 5,
          tokenHash: 'h',
          expiresAt: ahead(600),
          updatedAt: ago(29),
          ...over,
        },
      ],
    })

  it('moves updatedAt, under the submission lock, read after the lock', async () => {
    const f = world()
    bindFakeLog(f)
    expect(await touchPlaceSession({ payload: f.payload, sessionId: 9, now: NOW })).toBe(true)
    expect(f.row('place-upload-sessions').updatedAt).toBe(NOW.toISOString())
    const lock = f.log.indexOf('lock:lock-5')
    expect(lock).toBeGreaterThanOrEqual(0)
    expect(f.log.slice(lock + 1)).toContain('read:place-upload-sessions')
    // And the session is alive for another hold from that moment.
    const later = new Date(NOW.getTime() + 29 * 60_000)
    expect(placeSessionLife(f.row('place-upload-sessions') as never, 30, later)).toBe('live')
  })

  it('does nothing for a closed or missing session', async () => {
    const closed = world({ closedAt: ago(1) })
    expect(await touchPlaceSession({ payload: closed.payload, sessionId: 9, now: NOW })).toBe(false)
    expect(closed.row('place-upload-sessions').updatedAt).toBe(ago(29))
    const empty = fakePayload()
    expect(await touchPlaceSession({ payload: empty.payload, sessionId: 9, now: NOW })).toBe(false)
  })

  it('refuses an idle session (past holdMinutes) and one past its hard cap: it revives nothing', async () => {
    const idle = world({ updatedAt: ago(31) })
    expect(await touchPlaceSession({ payload: idle.payload, sessionId: 9, now: NOW })).toBe(false)
    expect(idle.row('place-upload-sessions').updatedAt).toBe(ago(31))
    const capped = world({ expiresAt: ago(1), updatedAt: ago(1) })
    expect(await touchPlaceSession({ payload: capped.payload, sessionId: 9, now: NOW })).toBe(false)
    expect(capped.row('place-upload-sessions').updatedAt).toBe(ago(1))
  })

  it('refuses when the business is no longer incomplete', async () => {
    const f = world({}, 'pending')
    expect(await touchPlaceSession({ payload: f.payload, sessionId: 9, now: NOW })).toBe(false)
    expect(f.row('place-upload-sessions').updatedAt).toBe(ago(29))
  })
})
