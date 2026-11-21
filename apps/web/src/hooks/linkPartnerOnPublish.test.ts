import { describe, expect, it, vi } from 'vitest'
import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
} from 'payload'
import { APIError } from 'payload'
import {
  approveSubmissionOnPublish,
  linkPartnerOnPublish,
  refusePublishingRejected,
} from './linkPartnerOnPublish'

vi.mock('../lib/report', () => ({ reportError: vi.fn(async () => {}) }))
import { reportError } from '../lib/report'

function harness({ partners = [] as Record<string, unknown>[], failCreate = false } = {}) {
  const find = vi.fn(async (_args: Record<string, unknown>) => ({ docs: partners }))
  const create = vi.fn(async (args: Record<string, unknown>) => {
    if (failCreate) throw new Error('boom')
    return { id: 50, ...(args.data as object) }
  })
  const update = vi.fn(async (_args: Record<string, unknown>) => ({}))
  const req = { payload: { find, create, update } }
  const run = (doc: Record<string, unknown>, previousDoc: Record<string, unknown> = {}) =>
    (linkPartnerOnPublish as CollectionAfterChangeHook)({
      doc,
      previousDoc,
      operation: 'update',
      req,
      context: {},
    } as never)
  return { find, create, update, req, run }
}

const published = {
  id: 9,
  _status: 'published',
  submission: { ownerEmail: 'Owner@Example.com', ownerName: 'Rita', ownerPhone: '+96170000000' },
}

describe('linkPartnerOnPublish', () => {
  it('creates a partner on first publish, inside the transaction', async () => {
    const h = harness()
    await h.run(published, { _status: 'draft' })
    expect(h.create).toHaveBeenCalledTimes(1)
    const args = h.create.mock.calls[0]![0] as { data: { password: string } }
    expect(args).toMatchObject({
      collection: 'business-users',
      overrideAccess: true,
      req: h.req,
      data: {
        name: 'Rita',
        email: 'owner@example.com',
        phone: '+96170000000',
        businesses: [9],
      },
    })
    expect(args.data.password.length).toBeGreaterThanOrEqual(32)
    expect(h.find.mock.calls[0]![0]).toMatchObject({ overrideAccess: true, req: h.req })
  })

  it('never reuses a password between partners', async () => {
    const a = harness()
    const b = harness()
    await a.run(published, {})
    await b.run(published, {})
    const pw = (h: typeof a) =>
      (h.create.mock.calls[0]![0] as { data: { password: string } }).data.password
    expect(pw(a)).not.toBe(pw(b))
    expect(pw(a)).not.toContain('example')
  })

  it('looks the partner up by lower-cased email', async () => {
    const h = harness()
    await h.run(published, {})
    expect(JSON.stringify(h.find.mock.calls[0]![0])).toContain('owner@example.com')
  })

  it('does nothing on a second publish (renewal)', async () => {
    const h = harness()
    await h.run(published, { _status: 'published' })
    expect(h.find).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
    expect(h.update).not.toHaveBeenCalled()
  })

  it('appends the listing to an existing partner', async () => {
    const h = harness({ partners: [{ id: 3, businesses: [7] }] })
    await h.run(published, {})
    expect(h.create).not.toHaveBeenCalled()
    expect(h.update.mock.calls[0]![0]).toMatchObject({
      collection: 'business-users',
      id: 3,
      data: { businesses: [7, 9] },
      overrideAccess: true,
      req: h.req,
    })
  })

  it('does not add a listing the partner already has', async () => {
    const h = harness({ partners: [{ id: 3, businesses: [{ id: 9 }] }] })
    await h.run(published, {})
    expect(h.update).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
  })

  it('ignores a listing without an owner email', async () => {
    const h = harness()
    await h.run({ id: 9, _status: 'published', submission: {} }, {})
    await h.run({ id: 9, _status: 'published' }, {})
    expect(h.find).not.toHaveBeenCalled()
  })

  it('ignores a listing that is not published', async () => {
    const h = harness()
    await h.run({ ...published, _status: 'draft' }, {})
    expect(h.find).not.toHaveBeenCalled()
  })

  it('reports a failure, then rethrows it so the publish visibly fails', async () => {
    const h = harness({ failCreate: true })
    const error = await h.run(published, {}).catch((e: unknown) => e)
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: 'partner.link' }),
    )
    expect(error).toBeInstanceOf(APIError)
    expect((error as APIError).status).toBe(500)
    expect((error as APIError).isPublic).toBe(true)
    expect((error as APIError).message).toMatch(/try publishing it again/i)
    expect((error as APIError).message).not.toMatch(/nothing was saved/i)
  })
})

describe('approveSubmissionOnPublish', () => {
  const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
    (approveSubmissionOnPublish as CollectionBeforeChangeHook)({
      data,
      originalDoc,
      operation: 'update',
    } as never) as { submission?: Record<string, unknown> }

  it('marks the submission approved on first publish, keeping its other fields', () => {
    const out = run(
      { _status: 'published' },
      { _status: 'draft', submission: { status: 'pending', ownerEmail: 'a@b.c' } },
    )
    expect(out.submission).toMatchObject({ status: 'approved', ownerEmail: 'a@b.c' })
  })

  it('leaves a listing with no submission alone', () => {
    const out = run({ _status: 'published' }, { _status: 'draft' })
    expect(out.submission).toBeUndefined()
  })

  it('does not touch a renewal', () => {
    const out = run(
      { _status: 'published' },
      { _status: 'published', submission: { status: 'approved', ownerEmail: 'a@b.c' } },
    )
    expect(out.submission).toBeUndefined()
  })
})

describe('refusePublishingRejected', () => {
  const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
    (refusePublishingRejected as CollectionBeforeValidateHook)({
      data,
      originalDoc,
      operation: 'update',
    } as never)
  /** The thrown error, or undefined when the hook lets the save through. */
  const refusal = (data: Record<string, unknown>, originalDoc: Record<string, unknown>) => {
    try {
      run(data, originalDoc)
    } catch (e) {
      return e
    }
    return undefined
  }

  it('refuses publishing a rejected submission', () => {
    let error: unknown
    try {
      run({ _status: 'published' }, { _status: 'draft', submission: { status: 'rejected' } })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(APIError)
    expect((error as APIError).status).toBe(400)
    expect((error as APIError).message).toMatch(/rejected/i)
  })

  it('allows publishing a pending one, and editing a rejected draft', () => {
    expect(() =>
      run({ _status: 'published' }, { _status: 'draft', submission: { status: 'pending' } }),
    ).not.toThrow()
    expect(() =>
      run({ name: 'x' }, { _status: 'draft', submission: { status: 'rejected' } }),
    ).not.toThrow()
  })

  /**
   * Rejecting releases the listing number (hooks/releaseListingNumber). On a
   * live listing that would free the printed number of a page still on the
   * website, so the next owner could take it.
   */
  describe('rejecting a published listing', () => {
    it('is refused while it stays published, telling staff to set it to Draft first', () => {
      const error = refusal(
        { submission: { status: 'rejected' } },
        { _status: 'published', submission: { status: 'approved' } },
      )
      expect(error).toBeInstanceOf(APIError)
      expect((error as APIError).status).toBe(400)
      expect((error as APIError).isPublic).toBe(true)
      expect((error as APIError).message).toMatch(/draft first/i)
    })

    it('is refused when a full admin save sends both fields', () => {
      const error = refusal(
        { _status: 'published', submission: { status: 'rejected' } },
        { _status: 'published', submission: { status: 'approved' } },
      )
      expect(error).toBeInstanceOf(APIError)
      expect((error as APIError).message).toMatch(/draft first/i)
    })

    it('is allowed in the same save that sets it back to Draft', () => {
      expect(
        refusal(
          { _status: 'draft', submission: { status: 'rejected' } },
          { _status: 'published', submission: { status: 'approved' } },
        ),
      ).toBeUndefined()
    })

    it('still lets staff edit a published listing that is not rejected', () => {
      expect(
        refusal({ name: 'x' }, { _status: 'published', submission: { status: 'approved' } }),
      ).toBeUndefined()
    })
  })

  it('makes the draft-to-published refusal public', () => {
    const error = refusal(
      { _status: 'published' },
      { _status: 'draft', submission: { status: 'rejected' } },
    )
    expect((error as APIError).isPublic).toBe(true)
    expect((error as APIError).message).toMatch(/back to pending/i)
  })
})

/**
 * Publishing a branch a partner added (Task 9). The branch endpoint already
 * appended it to the partner's listings and set `submission.ownerEmail` to the
 * partner's address, so the publish finds that partner and links nothing new.
 */
describe('linkPartnerOnPublish: a branch from POST /partner-data/branches', () => {
  const branch = {
    id: 77,
    _status: 'published',
    submission: { status: 'approved', ownerEmail: 'owner@example.com', ownerName: 'Rita' },
  }

  it('creates no second partner and no invitation when the branch is already theirs', async () => {
    const h = harness({ partners: [{ id: 3, email: 'owner@example.com', businesses: [10, 77] }] })
    await h.run(branch, { _status: 'draft' })
    expect(h.create).not.toHaveBeenCalled()
    expect(h.update).not.toHaveBeenCalled()
  })

  it('adds the branch and keeps the source when it is somehow missing, still no new account', async () => {
    const h = harness({
      partners: [{ id: 3, email: 'owner@example.com', businesses: [10, { id: 30 }] }],
    })
    await h.run(branch, { _status: 'draft' })
    expect(h.create).not.toHaveBeenCalled()
    expect(h.update).toHaveBeenCalledTimes(1)
    expect(h.update.mock.calls[0]![0]).toMatchObject({
      collection: 'business-users',
      id: 3,
      data: { businesses: [10, 30, 77] },
    })
  })

  it('does nothing on a later publish of the same branch', async () => {
    const h = harness({ partners: [{ id: 3, email: 'owner@example.com', businesses: [10] }] })
    await h.run(branch, { _status: 'published' })
    expect(h.find).not.toHaveBeenCalled()
  })
})

/**
 * Task 9 fix round: the read-modify-write of the partner's listings runs
 * under the partner lock the branch endpoint takes, and re-reads the row after
 * taking it, so a branch appended in between is not dropped.
 */
describe('linkPartnerOnPublish: under the partner lock', () => {
  it('takes the partner lock, then appends to the list as it is now', async () => {
    const execute = vi.fn(async () => ({ rows: [] }))
    let reads = 0
    const find = vi.fn(async () => {
      reads++
      // The first read finds the account by email; by the time the lock is
      // held, a branch (55) has been appended by POST /partner-data/branches.
      return { docs: [{ id: 3, businesses: reads === 1 ? [10] : [10, 55] }] }
    })
    const update = vi.fn(async () => ({}))
    const req = { payload: { find, create: vi.fn(), update, db: { drizzle: { execute } } } }
    await (linkPartnerOnPublish as CollectionAfterChangeHook)({
      doc: published,
      previousDoc: { _status: 'draft' },
      operation: 'update',
      req,
      context: {},
    } as never)
    expect(JSON.stringify((execute.mock.calls[0] as unknown[])[0])).toContain(
      'vardenia.branches.partner:3',
    )
    expect(find).toHaveBeenCalledTimes(2)
    expect((update.mock.calls[0] as unknown as [{ data: unknown }])[0].data).toEqual({
      businesses: [10, 55, 9],
    })
  })
})
