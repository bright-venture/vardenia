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
  requireContractToPublish,
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
    expect((error as APIError).message).toMatch(/rejection is final/i)
  })
})

/**
 * A submitted listing needs a contract end date to go live (20 November 2026),
 * or it never expires.
 */
describe('requireContractToPublish', () => {
  const submitted = {
    _status: 'draft',
    submission: { ownerEmail: 'owner@example.com', status: 'pending' },
  }
  const DAY = 24 * 60 * 60 * 1000
  const run = (data: Record<string, unknown>, originalDoc: Record<string, unknown>) =>
    (requireContractToPublish as CollectionBeforeValidateHook)({
      data,
      originalDoc,
      operation: 'update',
    } as never)

  it('refuses to publish a submitted listing with no contract end date', () => {
    expect(() => run({ _status: 'published' }, submitted)).toThrow(/contract end date/)
  })

  it('refuses an end date already past, which the daily job would hide again', () => {
    const past = new Date(Date.now() - 3 * DAY).toISOString()
    expect(() => run({ _status: 'published', contractEndsAt: past }, submitted)).toThrow(
      /has passed/,
    )
  })

  it('publishes with a future end date, given now or already saved', () => {
    const future = new Date(Date.now() + 365 * DAY).toISOString()
    expect(() => run({ _status: 'published', contractEndsAt: future }, submitted)).not.toThrow()
    expect(() =>
      run({ _status: 'published' }, { ...submitted, contractEndsAt: future }),
    ).not.toThrow()
  })

  it('renews: a lapsed listing republished with a new date', () => {
    const future = new Date(Date.now() + 365 * DAY).toISOString()
    const lapsed = {
      ...submitted,
      submission: { ownerEmail: 'owner@example.com', status: 'approved' },
    }
    expect(() => run({ _status: 'published', contractEndsAt: future }, lapsed)).not.toThrow()
  })

  it('leaves older listings that did not come through the form alone', () => {
    expect(() => run({ _status: 'published' }, { _status: 'draft', submission: {} })).not.toThrow()
  })

  it('does not stop ordinary saves of a listing that is already live', () => {
    expect(() => run({ name: 'Renamed' }, { ...submitted, _status: 'published' })).not.toThrow()
  })
})

/** Rejected is final (20 November 2026): no reopening. */
describe('a rejected submission cannot be reopened', () => {
  const rejected = {
    _status: 'draft',
    submission: { ownerEmail: 'o@example.com', status: 'rejected' },
  }
  const run = (data: Record<string, unknown>) =>
    (refusePublishingRejected as CollectionBeforeValidateHook)({
      data,
      originalDoc: rejected,
      operation: 'update',
    } as never)

  it.each(['pending', 'approved', 'expired'])('refuses setting it back to %s', (status) => {
    expect(() => run({ submission: { status } })).toThrow(/rejection is final/)
  })

  it('still lets staff edit the rejected record itself', () => {
    expect(() => run({ name: 'Typo fixed' })).not.toThrow()
    expect(() => run({ submission: { status: 'rejected' } })).not.toThrow()
  })
})
