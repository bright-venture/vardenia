import { describe, expect, it } from 'vitest'
import { requireTrashFirst } from './requireTrashFirst'

/** PRD v2 section 6: listings go to the trash first (QA, 22 November 2026). */

type Args = Parameters<typeof requireTrashFirst>[0]

function args(deletedAt: string | null, user: unknown = { id: 1, collection: 'users' }) {
  const asked: Record<string, unknown>[] = []
  const req = {
    user,
    payload: {
      findByID: async (options: Record<string, unknown>) => {
        asked.push(options)
        return { id: options.id, deletedAt }
      },
    },
  }
  return {
    asked,
    hookArgs: { collection: { slug: 'businesses' }, id: 7, req } as unknown as Args,
  }
}

describe('a listing goes to the trash before it is deleted for good', () => {
  it('refuses a signed-in person deleting a listing that is not in the trash', async () => {
    const { hookArgs } = args(null)
    await expect(requireTrashFirst(hookArgs)).rejects.toThrow(/trash first/)
  })

  it('lets the delete from the trash through, to the other guards', async () => {
    const { hookArgs, asked } = args('2026-11-22T12:00:00.000Z')
    await expect(requireTrashFirst(hookArgs)).resolves.toBeUndefined()
    // It must look in the trash, or a trashed listing would read as missing.
    expect(asked[0]).toMatchObject({ collection: 'businesses', id: 7, trash: true })
  })

  it('leaves scripts with no signed-in person alone (demo-import teardown, seed)', async () => {
    const { hookArgs, asked } = args(null, null)
    await expect(requireTrashFirst(hookArgs)).resolves.toBeUndefined()
    expect(asked).toHaveLength(0)
  })
})
