import { describe, expect, it, vi } from 'vitest'
import type { CollectionBeforeDeleteHook } from 'payload'
import { blockMediaInUse } from './blockMediaInUse'

/**
 * This hook exists to turn one specific unhelpful error into a sentence.
 *
 * Deleting an image a required field points at fails in Postgres with "An
 * unknown error has occurred", naming nothing. So the value here is entirely in
 * the message, which is why these tests read it rather than just checking that
 * something threw.
 */

type Docs = Record<string, Record<string, unknown>[]>

function harness(byCollection: Docs, totals: Record<string, number> = {}) {
  const payload = {
    find: vi.fn(async ({ collection }: { collection: string }) => {
      const docs = byCollection[collection] ?? []
      return { docs, totalDocs: totals[collection] ?? docs.length }
    }),
  }

  return (id: unknown) =>
    (blockMediaInUse as CollectionBeforeDeleteHook)({ id, req: { payload } } as never)
}

describe('blockMediaInUse', () => {
  it('allows deleting an image nothing requires', async () => {
    await expect(harness({})(1)).resolves.toBeUndefined()
  })

  it('names the issue holding it', async () => {
    const run = harness({ issues: [{ id: 3, title: 'Summer 2026' }] })
    await expect(run(1)).rejects.toThrow(/cover of "Summer 2026"/)
  })

  it('names the article holding it', async () => {
    const run = harness({ articles: [{ id: 4, title: 'A weekend in Dbayeh' }] })
    await expect(run(1)).rejects.toThrow(/hero image of "A weekend in Dbayeh"/)
  })

  /**
   * The bug. Businesses call it `name`, not `title`, so the commonest blocker
   * of all rendered as "#2" - an id, in the one message whose whole job is to
   * say which document is holding on.
   */
  it('names the business holding it, rather than its id', async () => {
    const run = harness({ businesses: [{ id: 2, name: 'Le Royal Hotel' }] })

    await expect(run(1)).rejects.toThrow(/hero image of "Le Royal Hotel"/)
    await expect(run(1)).rejects.not.toThrow(/#2/)
  })

  it('falls back to the id only when there is genuinely no label', async () => {
    const run = harness({ businesses: [{ id: 9 }] })
    await expect(run(1)).rejects.toThrow(/"#9"/)
  })

  it('lists every collection holding the image', async () => {
    const run = harness({
      issues: [{ id: 3, title: 'Summer 2026' }],
      businesses: [{ id: 2, name: 'Le Royal Hotel' }],
    })

    const error = await run(1).catch((e: Error) => e)
    expect(String(error)).toContain('Summer 2026')
    expect(String(error)).toContain('Le Royal Hotel')
  })

  it('says how many more there are rather than listing forever', async () => {
    const run = harness({ businesses: [{ id: 2, name: 'Le Royal Hotel' }] }, { businesses: 12 })
    await expect(run(1)).rejects.toThrow(/and 11 more/)
  })

  it('tells the editor what to do about it', async () => {
    const run = harness({ businesses: [{ id: 2, name: 'Le Royal Hotel' }] })
    await expect(run(1)).rejects.toThrow(/point them at a different image/)
  })

  it('counts drafts too, since they share the table the constraint is on', async () => {
    const run = harness({ businesses: [{ id: 2, name: 'Draft listing', _status: 'draft' }] })
    await expect(run(1)).rejects.toThrow(/Draft listing/)
  })
})
