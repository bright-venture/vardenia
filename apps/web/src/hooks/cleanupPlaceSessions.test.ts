import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/report', () => ({ reportError: vi.fn(async () => {}) }))

import { Businesses } from '../collections/Businesses'
import { fakePayload } from '../lib/place-submission-fake'
import { cleanupPlaceSessions } from './cleanupPlaceSessions'

/**
 * place_upload_sessions.business_id is NOT NULL with a foreign key `on delete
 * set null`, so a business that still has a session cannot be deleted for good.
 * The hook removes the sessions first, and is the last step of the collection's
 * own beforeDelete chain, after the guards.
 */

const world = () =>
  fakePayload({
    businesses: [{ id: 5, _status: 'draft', deletedAt: '2026-11-23T10:00:00Z' }],
    'place-upload-sessions': [
      { id: 1, business: 5, tokenHash: 'a' },
      { id: 2, business: 5, tokenHash: 'b' },
      { id: 3, business: 6, tokenHash: 'c' },
    ],
  })

describe('cleanupPlaceSessions', () => {
  it("deletes the business's sessions and only those", async () => {
    const f = world()
    await cleanupPlaceSessions({ id: 5, req: { payload: f.payload } } as never)
    expect(f.tables['place-upload-sessions']?.map((s) => s.id)).toEqual([3])
  })

  it('is on the businesses beforeDelete chain, after the guards', () => {
    const chain = Businesses.hooks?.beforeDelete ?? []
    expect(chain.at(-1)).toBe(cleanupPlaceSessions)
    expect(chain.length).toBeGreaterThan(1)
  })

  it('a trashed form-created business can be permanently deleted: the whole chain runs through', async () => {
    const f = world()
    const req = { user: { id: 1 }, payload: f.payload }
    for (const hook of Businesses.hooks?.beforeDelete ?? []) {
      await hook({ id: 5, collection: { slug: 'businesses' }, req, context: {} } as never)
    }
    // What the database would now do (on delete set null on a NOT NULL column)
    // finds no session row left for the business.
    expect(f.tables['place-upload-sessions']?.some((s) => s.business === 5)).toBe(false)
  })

  it('an untrashed business is still refused before any session is touched', async () => {
    const f = fakePayload({
      businesses: [{ id: 5, _status: 'draft' }],
      'place-upload-sessions': [{ id: 1, business: 5, tokenHash: 'a' }],
    })
    const req = { user: { id: 1 }, payload: f.payload }
    await expect(
      (async () => {
        for (const hook of Businesses.hooks?.beforeDelete ?? []) {
          await hook({ id: 5, collection: { slug: 'businesses' }, req, context: {} } as never)
        }
      })(),
    ).rejects.toThrow(/trash/i)
    expect(f.tables['place-upload-sessions']).toHaveLength(1)
  })
})
