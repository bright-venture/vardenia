import { describe, expect, it, vi } from 'vitest'

/**
 * The per-partner lock, replaced by an in-process mutex that behaves like
 * pg_advisory_xact_lock: held from the moment it is taken until the request's
 * transaction ends, which the race test below does by hand after its insert.
 * `lockMode.off` turns it into a no-op, to show the test fails without it.
 */
const lockMode = { off: false, timeoutMs: 0 }
let tail: Promise<void> = Promise.resolve()
vi.mock('../lib/upload-lock', async () => {
  const { APIError } = await import('payload')
  return {
    lockPartnerUploads: vi.fn(async (req: { release?: () => void }) => {
      if (lockMode.off) {
        req.release = () => {}
        return
      }
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      const before = tail
      tail = before.then(() => held)
      if (lockMode.timeoutMs > 0) {
        // Like SET LOCAL lock_timeout: give up waiting, answer 429. The queue
        // still moves on: a timed-out waiter holds nothing.
        const timedOut = await Promise.race([
          before.then(() => false),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(true), lockMode.timeoutMs)),
        ])
        if (timedOut) {
          void before.then(() => release())
          throw new APIError('Too many uploads in progress.', 429, null, true)
        }
      } else {
        await before
      }
      req.release = release
    }),
  }
})
import type { CollectionConfig, Field } from 'payload'
import { Media } from '../collections/Media'
import { mediaRead } from '../access/index'
import { blockMediaInUse } from './blockMediaInUse'
import { unguessableFilename } from './unguessableFilename'
import { PARTNER_UPLOADS_PER_HOUR, guardPartnerUpload, stampUploader } from './guardPartnerUpload'

/**
 * Partners uploading photos and a menu for their own listing (Task 3).
 */

const partner = { id: 5, collection: 'business-users', businesses: [10] }
const staff = { id: 1, collection: 'users', roles: ['staff'] }

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d])
const WEBP = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'binary')
const AVIF = Buffer.from('\x00\x00\x00\x1cftypavif\x00\x00\x00\x00', 'binary')
const PDF = Buffer.from('%PDF-1.7\n%\xe2\xe3', 'binary')
const MP4 = Buffer.from('\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00', 'binary')
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>')

const run = (opts: {
  user: unknown
  file?: { data: Buffer; mimetype: string; size?: number }
  operation?: 'create' | 'update' | 'read' | 'delete'
  overrideAccess?: boolean
  recent?: number
}) => {
  const count = vi.fn(async () => ({ totalDocs: opts.recent ?? 0 }))
  const args = { data: {} }
  const req: Record<string, unknown> & { release?: () => void } = {
    user: opts.user,
    file: opts.file && { size: opts.file.data.length, ...opts.file },
    payload: { count },
  }
  // The transaction ends when the guard is done, which releases the lock.
  const promise = Promise.resolve(
    guardPartnerUpload({
      args,
      operation: opts.operation ?? 'create',
      overrideAccess: opts.overrideAccess ?? false,
      collection: Media,
      context: {},
      req,
    } as never),
  ).finally(() => req.release?.())
  return { promise, count, args }
}

describe('what a partner may upload', () => {
  it.each([
    ['a JPEG', JPEG, 'image/jpeg'],
    ['a PNG', PNG, 'image/png'],
    ['a WebP', WEBP, 'image/webp'],
    ['an AVIF', AVIF, 'image/avif'],
    ['a PDF menu', PDF, 'application/pdf'],
  ])('accepts %s', async (_label, data, mimetype) => {
    await expect(run({ user: partner, file: { data, mimetype } }).promise).resolves.toBeTruthy()
  })

  it('refuses a video, which the team may upload', async () => {
    await expect(
      run({ user: partner, file: { data: MP4, mimetype: 'video/mp4' } }).promise,
    ).rejects.toMatchObject({ status: 415 })
  })

  it('refuses a file whose bytes are not what it claims', async () => {
    for (const data of [MP4, SVG, HTML]) {
      await expect(
        run({ user: partner, file: { data, mimetype: 'image/png' } }).promise,
      ).rejects.toMatchObject({ status: 415 })
    }
    await expect(
      run({ user: partner, file: { data: JPEG, mimetype: 'image/svg+xml' } }).promise,
    ).rejects.toMatchObject({ status: 415 })
  })

  it('refuses a partner create with no file', async () => {
    await expect(run({ user: partner }).promise).rejects.toMatchObject({ status: 400 })
  })

  it('counts recent uploads per partner and stops at the limit', async () => {
    const ok = run({ user: partner, file: { data: JPEG, mimetype: 'image/jpeg' }, recent: 3 })
    await expect(ok.promise).resolves.toBeTruthy()
    const where = (ok.count.mock.calls[0] as unknown as [{ where: unknown }])[0].where
    expect(JSON.stringify(where)).toContain('"uploadedBy":{"equals":5}')
    expect(JSON.stringify(where)).toContain('createdAt')

    await expect(
      run({
        user: partner,
        file: { data: JPEG, mimetype: 'image/jpeg' },
        recent: PARTNER_UPLOADS_PER_HOUR,
      }).promise,
    ).rejects.toMatchObject({ status: 429 })
  })
})

describe('everyone else is unchanged', () => {
  it('lets staff upload a video and anything else as before, uncounted', async () => {
    const { promise, count } = run({ user: staff, file: { data: MP4, mimetype: 'video/mp4' } })
    await expect(promise).resolves.toBeTruthy()
    expect(count).not.toHaveBeenCalled()
  })

  it("leaves the server's own uploads (overrideAccess) alone", async () => {
    const { promise } = run({
      user: partner,
      file: { data: MP4, mimetype: 'video/mp4' },
      overrideAccess: true,
    })
    await expect(promise).resolves.toBeTruthy()
  })

  it('ignores reads', async () => {
    await expect(run({ user: partner, operation: 'read' }).promise).resolves.toBeTruthy()
  })
})

describe('who uploaded it', () => {
  const stamp = (user: unknown, data: Record<string, unknown>, operation = 'create') =>
    stampUploader({ data, req: { user }, operation } as never) as Record<string, unknown>

  it('records the partner as the uploader, whatever the body said', () => {
    const data = stamp(partner, { uploadedBy: 99, attached: true, alt: 'Terrace' })
    expect(data).toMatchObject({ uploadedBy: 5, attached: false, usageRights: 'supplied' })
  })

  it('leaves a team upload with no uploader', () => {
    const data = stamp(staff, { alt: 'Cover' })
    expect(data.uploadedBy).toBeUndefined()
    expect(data.usageRights).toBeUndefined()
  })

  it('does nothing on update', () => {
    expect(stamp(partner, { alt: 'x' }, 'update')).toEqual({ alt: 'x' })
  })
})

describe('the Media collection', () => {
  const config = Media as CollectionConfig
  const field = (name: string) =>
    config.fields.find((f: Field) => 'name' in f && f.name === name) as Field & {
      access?: Record<string, (args: unknown) => unknown>
      relationTo?: string
    }
  const fctx = (user: unknown) => ({ req: { user } }) as never

  it('runs the partner guard before the operation, keeping size limit and renaming', () => {
    const before = config.hooks?.beforeOperation ?? []
    expect(before).toContain(guardPartnerUpload)
    expect(before).toContain(unguessableFilename)
    expect(before.length).toBe(3)
    expect(config.hooks?.beforeChange).toContain(stampUploader)
  })

  it('keeps the in-use guard on delete, and delete and update with staff', () => {
    expect(config.hooks?.beforeDelete).toContain(blockMediaInUse)
    const ctx = (user: unknown) => ({ req: { user } }) as never
    expect(config.access?.delete!(ctx(partner))).toBe(false)
    expect(config.access?.update!(ctx(partner))).toBe(false)
    // Permanent deletes of photos are admin only (staging, 21 November 2026).
    expect(config.access?.delete!(ctx(staff))).toBe(false)
    expect(config.access?.delete!(ctx({ id: 2, collection: 'users', roles: ['admin'] }))).toBe(true)
  })

  it('reads through mediaRead', () => {
    expect(config.access?.read).toBe(mediaRead)
  })

  it('has an uploader nobody can write through the API, read by staff only', () => {
    const uploadedBy = field('uploadedBy')
    expect(uploadedBy.relationTo).toBe('business-users')
    for (const user of [partner, staff, null]) {
      expect(uploadedBy.access?.create?.(fctx(user))).toBe(false)
      expect(uploadedBy.access?.update?.(fctx(user))).toBe(false)
    }
    expect(uploadedBy.access?.read?.(fctx(null))).toBe(false)
    expect(uploadedBy.access?.read?.(fctx(partner))).toBe(false)
    expect(uploadedBy.access?.read?.(fctx({ id: 2, collection: 'customers' }))).toBe(false)
    expect(uploadedBy.access?.read?.(fctx(staff))).toBe(true)
  })

  it('has an attached flag only staff may set by hand', () => {
    const attached = field('attached')
    expect(attached.type).toBe('checkbox')
    expect(attached.access?.create?.(fctx(partner))).toBe(false)
    expect(attached.access?.update?.(fctx(partner))).toBe(false)
    expect(attached.access?.update?.(fctx(staff))).toBe(true)
  })
})

describe('the hourly cap under parallel uploads', () => {
  /**
   * N uploads from one partner at once, against a store that counts what has
   * been inserted. Each attempt runs the guard, then (if allowed) inserts and
   * "commits", which is when the real advisory lock is released.
   */
  const race = async (already: number, attempts: number) => {
    const rows: number[] = Array.from({ length: already }, (_, i) => i)
    const count = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      return { totalDocs: rows.length }
    })
    const attempt = async (n: number) => {
      const req: { user: unknown; file: unknown; payload: unknown; release?: () => void } = {
        user: partner,
        file: { data: JPEG, mimetype: 'image/jpeg', size: JPEG.length },
        payload: { count },
      }
      try {
        await guardPartnerUpload({
          args: { data: {} },
          operation: 'create',
          overrideAccess: false,
          collection: Media,
          context: {},
          req,
        } as never)
        await new Promise((resolve) => setTimeout(resolve, 1))
        rows.push(n)
        return true
      } catch {
        return false
      } finally {
        req.release?.()
      }
    }
    const results = await Promise.all(Array.from({ length: attempts }, (_, n) => attempt(n)))
    return { rows, allowed: results.filter(Boolean).length }
  }

  it('holds when a partner fires many uploads at once', async () => {
    lockMode.off = false
    const { rows, allowed } = await race(PARTNER_UPLOADS_PER_HOUR - 3, 10)
    expect(allowed).toBe(3)
    expect(rows.length).toBe(PARTNER_UPLOADS_PER_HOUR)
  })

  it('gives queued uploads a 429 after the wait times out, and the cap still holds', async () => {
    lockMode.off = false
    lockMode.timeoutMs = 25
    // Each allowed upload holds the lock ~2 ms of fake work plus the count;
    // with 30 at once, the back of the queue waits longer than 25 ms.
    const statuses: number[] = []
    const rows: number[] = Array.from({ length: PARTNER_UPLOADS_PER_HOUR - 20 }, (_, i) => i)
    const count = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2))
      return { totalDocs: rows.length }
    })
    await Promise.all(
      Array.from({ length: 30 }, async (_, n) => {
        const req: Record<string, unknown> & { release?: () => void } = {
          user: partner,
          file: { data: JPEG, mimetype: 'image/jpeg', size: JPEG.length },
          payload: { count },
        }
        try {
          await guardPartnerUpload({
            args: { data: {} },
            operation: 'create',
            overrideAccess: false,
            collection: Media,
            context: {},
            req,
          } as never)
          await new Promise((resolve) => setTimeout(resolve, 2))
          rows.push(n)
          statuses.push(201)
        } catch (error) {
          statuses.push((error as { status?: number }).status ?? 500)
        } finally {
          req.release?.()
        }
      }),
    )
    lockMode.timeoutMs = 0
    expect(statuses).not.toContain(500)
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(PARTNER_UPLOADS_PER_HOUR)
  })

  it('would not hold without the lock (the test has teeth)', async () => {
    lockMode.off = true
    const { rows } = await race(PARTNER_UPLOADS_PER_HOUR - 3, 10)
    expect(rows.length).toBeGreaterThan(PARTNER_UPLOADS_PER_HOUR)
    lockMode.off = false
  })
})
