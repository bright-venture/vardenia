import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Media } from '../collections/Media'
import { blockMediaInUse } from './blockMediaInUse'
import { unguessableFilename } from './unguessableFilename'
import { revalidateMediaAfterChange, revalidateMediaAfterDelete } from './revalidateMedia'

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag }))

beforeEach(() => {
  revalidateTag.mockReset()
})

describe('media-dependent cache invalidation', () => {
  it('registers the new hooks without removing filename and in-use protections', () => {
    expect(Media.hooks?.beforeOperation).toContain(unguessableFilename)
    expect(Media.hooks?.beforeDelete).toContain(blockMediaInUse)
    expect(Media.hooks?.afterChange).toContain(revalidateMediaAfterChange)
    expect(Media.hooks?.afterDelete).toContain(revalidateMediaAfterDelete)
  })

  it.each(['create', 'update'] as const)('expires only media reads after %s', async (operation) => {
    const doc = Object.freeze({ id: 17, url: '/test-only/photo.webp', alt: 'Test image' })
    expect(await revalidateMediaAfterChange({ doc, operation } as never)).toBe(doc)
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith('media', { expire: 0 })
  })

  it('expires media reads after a successful deletion', async () => {
    const doc = Object.freeze({ id: 17 })
    expect(await revalidateMediaAfterDelete({ doc } as never)).toBe(doc)
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith('media', { expire: 0 })
  })

  it.each([revalidateMediaAfterChange, revalidateMediaAfterDelete])(
    'does not fail an operation outside the Next request runtime',
    async (hook) => {
      revalidateTag.mockImplementation(() => {
        throw new Error('Test: no Next request cache')
      })
      const doc = Object.freeze({ id: 17 })
      await expect(hook({ doc } as never)).resolves.toBe(doc)
    },
  )
})
