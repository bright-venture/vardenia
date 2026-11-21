import { describe, expect, it, vi } from 'vitest'
import type { CollectionConfig } from 'payload'
import { Businesses } from '../collections/Businesses'
import { RoomTypes } from '../collections/RoomTypes'
import { Articles } from '../collections/Articles'
import { Issues } from '../collections/Issues'
import { markMediaAttached } from './markMediaAttached'

/**
 * A partner's upload becomes public once a page uses it (Task 3). Until then
 * only staff and the uploader can read it (access mediaRead).
 */

const run = (collection: CollectionConfig, doc: Record<string, unknown>) => {
  const update = vi.fn(async () => ({ docs: [], errors: [] }))
  const result = markMediaAttached({
    doc,
    previousDoc: {},
    collection,
    operation: 'update',
    context: {},
    req: { payload: { update } },
  } as never)
  return { result: Promise.resolve(result), update }
}

describe('marking media attached', () => {
  it('flags every media id a listing points at, populated or not', async () => {
    const doc = { id: 10, heroImage: 1, gallery: [2, { id: 3, url: '/x' }], logo: null, menu: 4 }
    const { result, update } = run(Businesses, doc)
    await expect(result).resolves.toBe(doc)
    expect(update).toHaveBeenCalledTimes(1)
    const call = (update.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(call).toMatchObject({
      collection: 'media',
      data: { attached: true },
      overrideAccess: true,
    })
    const where = JSON.stringify(call.where)
    expect(where).toContain('"in":[1,2,3,4]')
    // Only partner uploads not yet flagged: team media needs no flag.
    expect(where).toContain('"uploadedBy":{"exists":true}')
  })

  it('does nothing when the document names no media', async () => {
    const { update } = run(Businesses, { id: 10, heroImage: null })
    await Promise.resolve()
    expect(update).not.toHaveBeenCalled()
  })

  it('is wired on every collection that shows media publicly', () => {
    for (const config of [Businesses, RoomTypes, Articles, Issues] as CollectionConfig[]) {
      expect(config.hooks?.afterChange, config.slug).toContain(markMediaAttached)
    }
  })

  it('finds room type photos', async () => {
    const { result, update } = run(RoomTypes as CollectionConfig, { id: 3, photos: [7, 8] })
    await result
    const where = JSON.stringify((update.mock.calls[0] as unknown as [{ where: unknown }])[0].where)
    expect(where).toContain('"in":[7,8]')
  })
})

describe('media inside rich text', () => {
  const doc = (...children: unknown[]) => ({ root: { type: 'root', children } })
  const upload = (value: unknown) => ({ type: 'upload', relationTo: 'media', value, fields: null })

  it("marks a partner's upload placed in a listing description", async () => {
    const { result, update } = run(Businesses, {
      id: 10,
      heroImage: 1,
      description: doc({ type: 'paragraph', children: [upload(21)] }, upload({ id: 22 })),
    })
    await result
    const where = JSON.stringify((update.mock.calls[0] as unknown as [{ where: unknown }])[0].where)
    const ids = (JSON.parse(where).and[0].id.in as number[]).sort((a, b) => a - b)
    expect(ids).toEqual([1, 21, 22])
  })

  it('marks media used in an article body', async () => {
    const { result, update } = run(Articles as CollectionConfig, {
      id: 4,
      heroImage: 1,
      body: doc(upload(9)),
    })
    await result
    const where = JSON.stringify((update.mock.calls[0] as unknown as [{ where: unknown }])[0].where)
    expect(where).toContain('9')
  })
})
