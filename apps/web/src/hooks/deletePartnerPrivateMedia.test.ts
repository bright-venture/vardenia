import { describe, expect, it, vi } from 'vitest'
import type { CollectionBeforeDeleteHook, Where } from 'payload'
import { BusinessUsers } from '../collections/BusinessUsers'
import { matches, type Row } from '../lib/__fixtures__/memory-payload'
import { deletePartnerPrivateMedia } from './deletePartnerPrivateMedia'

/**
 * Deleting a partner nulls media.uploaded_by (on delete set null), and the
 * public read rule (access mediaRead) treats a file with no uploader as a
 * team upload, which is public. So a partner's files that no page uses yet,
 * private while the partner existed, would become public. The partner's
 * beforeDelete removes exactly those first, in the same transaction.
 */

const media = (): Row[] => [
  { id: 1, uploadedBy: 7, attached: false }, // partner 7, on no page: goes
  { id: 2, uploadedBy: 7, attached: true }, // partner 7, on a page: stays
  { id: 3, uploadedBy: 7, attached: null }, // partner 7, never marked: goes
  { id: 4, uploadedBy: 8, attached: false }, // another partner: stays
  { id: 5, uploadedBy: null, attached: false }, // a team upload: stays
]

function harness(rows: Row[], failOn: number[] = []) {
  const remaining = [...rows]
  const del = vi.fn(async (args: { collection: string; where: Where }) => {
    const docs: Row[] = []
    const errors: { id: number; message: string }[] = []
    for (const row of remaining.filter((r) => matches(r, args.where))) {
      // A per-document beforeDelete refusal (blockMediaInUse) is collected,
      // not thrown, by Payload's bulk delete.
      if (failOn.includes(row.id)) errors.push({ id: row.id, message: 'still in use' })
      else docs.push(row)
    }
    for (const row of docs) remaining.splice(remaining.indexOf(row), 1)
    return { docs, errors }
  })
  const req = { payload: { delete: del }, transactionID: 'tx-1' }
  const run = (id: number) =>
    (deletePartnerPrivateMedia as CollectionBeforeDeleteHook)({ id, req } as never)
  return { run, del, remaining, req }
}

describe('deletePartnerPrivateMedia', () => {
  it('is registered as a beforeDelete hook of business-users', () => {
    expect(BusinessUsers.hooks?.beforeDelete).toContain(deletePartnerPrivateMedia)
  })

  it("deletes only that partner's files that no page uses", async () => {
    const h = harness(media())
    await expect(h.run(7)).resolves.toBeUndefined()
    expect(h.remaining.map((r) => r.id)).toEqual([2, 4, 5])
  })

  it('runs as the system, inside the same request (one transaction)', async () => {
    const h = harness(media())
    await h.run(7)
    expect(h.del).toHaveBeenCalledTimes(1)
    const args = h.del.mock.calls[0]![0] as unknown as Record<string, unknown>
    expect(args).toMatchObject({ collection: 'media', overrideAccess: true })
    expect(args.req).toBe(h.req)
  })

  it('does nothing for a partner with no private files', async () => {
    const h = harness(media())
    await h.run(99)
    expect(h.remaining).toHaveLength(5)
  })

  it('aborts the partner delete when a file could not be deleted', async () => {
    const h = harness(media(), [3])
    await expect(h.run(7)).rejects.toThrow(/not deleted.*still in use/)
  })
})
