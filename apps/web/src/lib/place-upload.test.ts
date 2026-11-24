import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('./branches', async () => ({
  runInTransaction: (await import('./place-submission-fake')).runInFakeTransaction,
}))
vi.mock('./partner-lock', async () => ({
  advisoryLock: (await import('./place-submission-fake')).fakeAdvisoryLock,
  placeSubmissionLockKey: (id: number | string) => `lock-${id}`,
}))

import { PHOTO_MAX_BYTES } from '../hooks/limitUploadSize'
import { reportError } from './report'
import { bindFakeLog, fakePayload, type FakePayload } from './place-submission-fake'
import { hashSessionToken } from './place-submission'
import { attachPlacePhoto, placeSessionStatus } from './place-upload'

const TOKEN = 'tok-secret-123'
const NOW = new Date('2026-11-23T12:00:00.000Z')
const ago = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()
const ahead = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString()

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const png = (name = 'logo.png') => new File([PNG], name, { type: 'image/png' })
const jpeg = (name = 'main.jpg') => new File([JPEG], name, { type: 'image/jpeg' })

function world(
  over: { business?: Record<string, unknown>; session?: Record<string, unknown> } = {},
) {
  const f = fakePayload({
    businesses: [
      {
        id: 5,
        name: 'Cafe Nour',
        tier: 'silver',
        heroImage: null,
        logo: null,
        submission: { status: 'incomplete', ownerEmail: 'nour@example.com' },
        ...over.business,
      },
    ],
    'place-upload-sessions': [
      {
        id: 9,
        tokenHash: hashSessionToken(TOKEN),
        business: 5,
        expiresAt: ahead(600),
        updatedAt: ago(1),
        logoReceived: false,
        heroReceived: false,
        ...over.session,
      },
    ],
  })
  bindFakeLog(f)
  return f
}

const upload = (
  f: FakePayload,
  slot: 'logo' | 'hero',
  file: File | undefined,
  over: Record<string, unknown> = {},
) => attachPlacePhoto({ payload: f.payload, token: TOKEN, slot, file, now: NOW, ...over })

const session = (f: FakePayload) => f.row('place-upload-sessions')
const business = (f: FakePayload) => f.row('businesses')

beforeEach(() => vi.mocked(reportError).mockClear())

describe('attachPlacePhoto', () => {
  it('stores the logo: media as supplied with the business name as alt, only logo set, session recorded and touched', async () => {
    const f = world()
    const r = await upload(f, 'logo', png())
    expect(r).toEqual({ ok: true, slot: 'logo', logoReceived: true, heroReceived: false })

    expect(f.creates).toHaveLength(1)
    expect(f.creates[0]!.collection).toBe('media')
    expect(f.creates[0]!.data).toMatchObject({
      alt: 'Cafe Nour',
      usageRights: 'supplied',
      attached: false,
    })
    const mediaId = f.row('media').id
    expect(business(f).logo).toBe(mediaId)
    expect(business(f).heroImage).toBeNull()
    expect(session(f)).toMatchObject({
      mediaIds: [mediaId],
      logoReceived: true,
      heroReceived: false,
      updatedAt: NOW.toISOString(),
    })
  })

  it('writes only the one business field (nothing else), never a spread of anything', async () => {
    const f = world()
    await upload(f, 'hero', jpeg())
    const businessWrites = f.updates.filter((u) => u.collection === 'businesses')
    expect(businessWrites).toHaveLength(1)
    expect(Object.keys(businessWrites[0]!.data)).toEqual(['heroImage'])
    expect(business(f).submission).toEqual({
      status: 'incomplete',
      ownerEmail: 'nour@example.com',
    })
  })

  it('both flags are true once both photos are in', async () => {
    const f = world()
    await upload(f, 'hero', jpeg())
    const r = await upload(f, 'logo', png())
    expect(r).toEqual({ ok: true, slot: 'logo', logoReceived: true, heroReceived: true })
    expect(session(f).mediaIds).toHaveLength(2)
  })

  describe('a bad caller learns nothing: every refusal is the same not-found and stores nothing', () => {
    const cases: Array<[string, () => FakePayload, Record<string, unknown>?]> = [
      ['unknown token', () => world(), { token: 'nope' }],
      ['empty token', () => world(), { token: '' }],
      ['oversized token', () => world(), { token: 'x'.repeat(500) }],
      ['non-string token', () => world(), { token: 12 as never }],
      ['unknown slot', () => world(), { slot: 'gallery' as never }],
      ['closed session', () => world({ session: { closedAt: ago(1) } })],
      ['idle session', () => world({ session: { updatedAt: ago(31) } })],
      ['session past the hard cap', () => world({ session: { expiresAt: ago(1) } })],
      ['business pending', () => world({ business: { submission: { status: 'pending' } } })],
      ['business abandoned', () => world({ business: { submission: { status: 'abandoned' } } })],
    ]
    it.each(cases)('%s', async (_name, make, over) => {
      const f = make()
      const r = await upload(f, 'logo', png(), over)
      expect(r).toEqual({ ok: false, code: 'not-found' })
      expect(f.creates).toHaveLength(0)
      expect(f.tables.media).toHaveLength(0)
      expect(business(f).logo).toBeNull()
      expect(session(f).logoReceived).toBe(false)
    })

    it('a bad token gets not-found even with a bad file (the file is not examined first)', async () => {
      const f = world()
      const bad = new File(['hello'], 'a.png', { type: 'image/png' })
      expect(await upload(f, 'logo', bad, { token: 'nope' })).toEqual({
        ok: false,
        code: 'not-found',
      })
    })
  })

  describe('the file is checked by its bytes', () => {
    it('refuses a text file named .png and declared image/png', async () => {
      const f = world()
      const r = await upload(
        f,
        'logo',
        new File(['<script>alert(1)</script>'], 'a.png', { type: 'image/png' }),
      )
      expect(r).toMatchObject({ ok: false, code: 'bad-type' })
      expect(f.creates).toHaveLength(0)
    })
    it('refuses a PNG declared as image/jpeg', async () => {
      const f = world()
      expect(
        await upload(f, 'logo', new File([PNG], 'a.jpg', { type: 'image/jpeg' })),
      ).toMatchObject({
        code: 'bad-type',
      })
    })
    it.each(['image/svg+xml', 'application/pdf', 'video/mp4', 'image/gif', ''])(
      'refuses declared type %s',
      async (type) => {
        const f = world()
        expect(await upload(f, 'hero', new File([PNG], 'x.png', { type }))).toMatchObject({
          ok: false,
          code: 'bad-type',
        })
        expect(f.creates).toHaveLength(0)
      },
    )
    it('refuses an empty file and a missing one', async () => {
      const f = world()
      expect(await upload(f, 'hero', new File([], 'x.png', { type: 'image/png' }))).toMatchObject({
        code: 'bad-file',
      })
      expect(await upload(f, 'hero', undefined)).toMatchObject({ code: 'bad-file' })
    })
    it('refuses a file over PHOTO_MAX_BYTES without reading it', async () => {
      const f = world()
      const big = new File([PNG], 'big.png', { type: 'image/png' })
      Object.defineProperty(big, 'size', { value: PHOTO_MAX_BYTES + 1 })
      const read = vi.spyOn(big, 'arrayBuffer')
      expect(await upload(f, 'hero', big)).toMatchObject({ ok: false, code: 'too-large' })
      expect(read).not.toHaveBeenCalled()
      expect(f.creates).toHaveLength(0)
    })
    it('accepts JPEG, PNG and WebP', async () => {
      const webp = Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')
      const f = world()
      expect((await upload(f, 'hero', jpeg())).ok).toBe(true)
      expect((await upload(f, 'hero', png())).ok).toBe(true)
      expect((await upload(f, 'hero', new File([webp], 'a.webp', { type: 'image/webp' }))).ok).toBe(
        true,
      )
    })
  })

  describe('replacing a photo in the same slot', () => {
    it('deletes the previous one when this session made it, and records only the live ids', async () => {
      const f = world()
      await upload(f, 'hero', jpeg('one.jpg'))
      const first = f.row('media').id
      await upload(f, 'hero', jpeg('two.jpg'))
      const ids = f.tables.media!.map((m) => m.id)
      expect(ids).not.toContain(first)
      expect(ids).toHaveLength(1)
      expect(business(f).heroImage).toBe(ids[0])
      expect(session(f).mediaIds).toEqual(ids)
      expect(session(f).heroReceived).toBe(true)
    })

    it('never deletes a library image staff attached (not recorded on the session)', async () => {
      const f = world({ business: { heroImage: 900 }, session: { mediaIds: [] } })
      f.tables.media!.push({ id: 900 })
      await upload(f, 'hero', jpeg())
      expect(f.tables.media!.map((m) => m.id)).toContain(900)
      expect(business(f).heroImage).not.toBe(900)
    })

    it('does not touch the other slot', async () => {
      const f = world()
      await upload(f, 'logo', png())
      const logo = f.row('media').id
      await upload(f, 'hero', jpeg())
      expect(f.tables.media!.map((m) => m.id)).toContain(logo)
      expect(business(f).logo).toBe(logo)
    })

    it('keeps the replaced file until the new one is committed (deleted after commit)', async () => {
      const f = world()
      await upload(f, 'hero', jpeg())
      const first = f.row('media').id
      f.failUpdate.add('place-upload-sessions:9')
      const r = await upload(f, 'hero', jpeg())
      expect(r).toEqual({ ok: false, code: 'error' })
      expect(f.tables.media!.map((m) => m.id)).toEqual([first])
    })
  })

  describe('never leaves an orphan', () => {
    it('deletes the media when the business write fails', async () => {
      const f = world()
      f.failUpdate.add('businesses:5')
      expect(await upload(f, 'logo', png())).toEqual({ ok: false, code: 'error' })
      expect(f.tables.media).toHaveLength(0)
      expect(reportError).toHaveBeenCalled()
    })
    it('deletes the media when the session write fails', async () => {
      const f = world()
      f.failUpdate.add('place-upload-sessions:9')
      expect(await upload(f, 'logo', png())).toEqual({ ok: false, code: 'error' })
      expect(f.tables.media).toHaveLength(0)
    })
    it('reports (and survives) a media that cannot be deleted either', async () => {
      const f = world()
      f.failUpdate.add('businesses:5')
      f.failDelete.add('media:101')
      expect(await upload(f, 'logo', png())).toEqual({ ok: false, code: 'error' })
      expect(reportError).toHaveBeenCalledTimes(2)
    })
    it('a failed media create is an error and stores nothing', async () => {
      const f = world()
      f.failCreate.add('media')
      expect(await upload(f, 'logo', png())).toEqual({ ok: false, code: 'error' })
      expect(session(f).logoReceived).toBe(false)
    })
    it('deletes the media when the session died between the first look and the lock', async () => {
      const f = world()
      const create = f.payload.create.bind(f.payload)
      // The session is closed (a finish, an abandon) while the file is being stored.
      f.payload.create = (async (args: never) => {
        const row = await create(args)
        session(f).closedAt = NOW.toISOString()
        return row
      }) as never
      expect(await upload(f, 'logo', png())).toEqual({ ok: false, code: 'not-found' })
      expect(f.tables.media).toHaveLength(0)
      expect(business(f).logo).toBeNull()
      expect(session(f).logoReceived).toBe(false)
    })
    it('deletes the media when the business moved on between the first look and the lock', async () => {
      const f = world()
      const create = f.payload.create.bind(f.payload)
      f.payload.create = (async (args: never) => {
        const row = await create(args)
        business(f).submission = { status: 'pending' }
        return row
      }) as never
      expect(await upload(f, 'hero', jpeg())).toEqual({ ok: false, code: 'not-found' })
      expect(f.tables.media).toHaveLength(0)
      expect(business(f).heroImage).toBeNull()
    })
    it('an idle session cannot be revived by a late upload that passed the first look', async () => {
      const f = world({ session: { updatedAt: ago(29) } })
      const create = f.payload.create.bind(f.payload)
      // Time passes while the file is stored: by the lock the hold has run out.
      f.payload.create = (async (args: never) => {
        const row = await create(args)
        session(f).updatedAt = ago(31)
        return row
      }) as never
      expect(await upload(f, 'logo', png())).toEqual({ ok: false, code: 'not-found' })
      expect(session(f).updatedAt).toBe(ago(31))
    })
  })

  it('takes the submission lock before it re-reads the session and the business', async () => {
    const f = world()
    await upload(f, 'logo', png())
    const lock = f.log.indexOf('lock:lock-5')
    expect(lock).toBeGreaterThanOrEqual(0)
    const after = f.log.slice(lock + 1)
    expect(after.indexOf('read:place-upload-sessions')).toBeGreaterThanOrEqual(0)
    expect(after.indexOf('read:businesses')).toBeGreaterThanOrEqual(0)
    // The media write comes before the lock, the attaching after it.
    expect(f.creates).toHaveLength(1)
  })

  it('moves the idle clock: a photo at minute 29 keeps the form alive at minute 31', async () => {
    const f = world({ session: { updatedAt: ago(29) } })
    await upload(f, 'logo', png())
    expect(session(f).updatedAt).toBe(NOW.toISOString())
  })

  it('does not put the token anywhere it reports', async () => {
    const f = world()
    f.failUpdate.add('businesses:5')
    await upload(f, 'logo', png())
    expect(JSON.stringify(vi.mocked(reportError).mock.calls)).not.toContain(TOKEN)
  })
})

describe('placeSessionStatus', () => {
  const status = (f: FakePayload, over: Record<string, unknown> = {}) =>
    placeSessionStatus({ payload: f.payload, token: TOKEN, now: NOW, ...over })

  it('reports the flags and live, and returns nothing private', async () => {
    const f = world({ session: { heroReceived: true } })
    const r = await status(f)
    expect(r).toEqual({ ok: true, logoReceived: false, heroReceived: true, live: true })
    expect(JSON.stringify(r)).not.toMatch(/nour|example|Cafe|VD-|mediaIds|tokenHash/i)
  })

  it('reads only: nothing is written, the idle clock does not move', async () => {
    const f = world()
    await status(f)
    expect(f.updates).toHaveLength(0)
  })

  it('an idle or hard-capped session on an unfinished form is live:false', async () => {
    expect(await status(world({ session: { updatedAt: ago(31) } }))).toMatchObject({
      ok: true,
      live: false,
    })
    expect(await status(world({ session: { expiresAt: ago(1) } }))).toMatchObject({ live: false })
  })

  it('unknown token, closed session and a business that moved on are one not-found', async () => {
    const nf = { ok: false, code: 'not-found' }
    expect(await status(world(), { token: 'nope' })).toEqual(nf)
    expect(await status(world(), { token: '' })).toEqual(nf)
    expect(await status(world({ session: { closedAt: ago(1) } }))).toEqual(nf)
    expect(await status(world({ business: { submission: { status: 'pending' } } }))).toEqual(nf)
  })
})
