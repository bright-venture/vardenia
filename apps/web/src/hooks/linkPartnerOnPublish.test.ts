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
  notifyPublished,
  refusePublishingRejected,
  refusePublishingUnfinished,
  requireContractToPublish,
} from './linkPartnerOnPublish'

vi.mock('../lib/report', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('../lib/place-payment-notify', () => ({ notifyAfterChange: vi.fn(async () => {}) }))
import { reportError } from '../lib/report'
import { notifyAfterChange } from '../lib/place-payment-notify'

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
  // A renewal: the first publish of a paid submission sets its own dates.
  const submitted = {
    _status: 'draft',
    submission: { ownerEmail: 'owner@example.com', status: 'expired' },
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

  it('asks no date on the first publish of a paid submission (set automatically)', () => {
    const paid = { _status: 'draft', submission: { ownerEmail: 'o@e.com', status: 'paid' } }
    expect(() => run({ _status: 'published' }, paid)).not.toThrow()
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

describe('refusePublishingUnfinished', () => {
  const run = (data: Record<string, unknown>, originalDoc: Record<string, unknown> = {}) =>
    (refusePublishingUnfinished as CollectionBeforeValidateHook)({
      data,
      originalDoc,
      operation: 'update',
    } as never)

  it.each(['incomplete', 'abandoned', 'lapsed'])('refuses to publish a %s submission', (status) => {
    expect(() =>
      run({ _status: 'published' }, { _status: 'draft', submission: { status } }),
    ).toThrow(APIError)
    expect(() =>
      run({ _status: 'published', submission: { status } }, { _status: 'draft' }),
    ).toThrow(APIError)
  })

  it.each(['awaiting_downpayment', 'pending', 'accepted'])(
    'refuses a %s submission until it is paid, with a plain message',
    (status) => {
      const doc = { _status: 'draft', submission: { status } }
      expect(() => run({ _status: 'published' }, doc)).toThrow(APIError)
      expect(() => run({ _status: 'published' }, doc)).toThrow(/paid|downpayment/)
    },
  )

  it('lets a fully paid submission through', () => {
    const data = { _status: 'published' }
    expect(run(data, { _status: 'draft', submission: { status: 'paid' } })).toBe(data)
  })

  it.each(['awaiting_downpayment', 'pending', 'accepted'])(
    'refuses a %s submission even with an old override timestamp on file (no exception)',
    (status) => {
      const doc = {
        _status: 'draft',
        submission: { status, payment: { publishOverrideAt: '2026-11-24T10:00:00.000Z' } },
      }
      expect(() => run({ _status: 'published' }, doc)).toThrow(APIError)
    },
  )

  it('the old single "paid" flag no longer opens the door', () => {
    const doc = {
      _status: 'draft',
      submission: { status: 'accepted', payment: { status: 'paid' } },
    }
    expect(() => run({ _status: 'published' }, doc)).toThrow(APIError)
  })

  it('leaves renewals and listings without a submission as they were', () => {
    for (const status of ['approved', 'expired', undefined]) {
      const data = { _status: 'published' }
      expect(run(data, { _status: 'draft', submission: { status } })).toBe(data)
    }
  })

  it('does not block saving a draft, or an already published listing', () => {
    const draft = { name: 'x' }
    expect(run(draft, { _status: 'draft', submission: { status: 'incomplete' } })).toBe(draft)
    const live = { name: 'x' }
    expect(run(live, { _status: 'published', submission: { status: 'lapsed' } })).toBe(live)
  })
})

describe('approveSubmissionOnPublish after payment', () => {
  const run = (originalDoc: Record<string, unknown>, data: Record<string, unknown> = {}) =>
    (approveSubmissionOnPublish as CollectionBeforeChangeHook)({
      data: { _status: 'published', ...data },
      originalDoc,
      operation: 'update',
    } as never) as Record<string, unknown> & {
      submission: { status: string; payment?: Record<string, unknown> }
    }

  it('approves a paid submission, starts the contract today for the agreed term, keeps the stage', () => {
    const before = Date.now()
    const out = run({
      _status: 'draft',
      contractEndsAt: '2020-01-01T00:00:00.000Z',
      submission: {
        status: 'paid',
        ownerEmail: 'a@b.c',
        terms: { termMonths: 6 },
        payment: { stage: 'fully_paid' },
      },
    })
    expect(out.submission.status).toBe('approved')
    expect(out.submission.payment).toEqual({ stage: 'fully_paid' })
    const start = new Date(String(out.contractStartsAt))
    expect(start.getTime()).toBeGreaterThanOrEqual(before)
    const end = new Date(String(out.contractEndsAt))
    const expected = new Date(start)
    expected.setUTCMonth(expected.getUTCMonth() + 6)
    expect(Math.abs(end.getTime() - expected.getTime())).toBeLessThan(4 * 24 * 3600 * 1000)
  })

  it('uses 12 months when the term is missing', () => {
    const out = run({ _status: 'draft', submission: { status: 'paid', ownerEmail: 'a@b.c' } })
    const months =
      (new Date(String(out.contractEndsAt)).getUTCFullYear() -
        new Date(String(out.contractStartsAt)).getUTCFullYear()) *
        12 +
      new Date(String(out.contractEndsAt)).getUTCMonth() -
      new Date(String(out.contractStartsAt)).getUTCMonth()
    expect(months).toBe(12)
  })

  it('does not touch the dates of a renewal', () => {
    const out = run(
      { _status: 'draft', submission: { status: 'expired', ownerEmail: 'a@b.c' } },
      { contractEndsAt: '2027-12-01T00:00:00.000Z' },
    )
    expect(out.submission.status).toBe('approved')
    expect(out.contractEndsAt).toBe('2027-12-01T00:00:00.000Z')
    expect(out.contractStartsAt).toBeUndefined()
  })
})

describe('notifyPublished (E8)', () => {
  const doc = { id: 9, _status: 'published', submission: { status: 'approved' } }
  const previous = { _status: 'draft', submission: { status: 'paid' } }

  const harnessE8 = (stored: Record<string, unknown> | null) => {
    const req = {
      transactionID: 1 as number | undefined,
      payload: { findByID: vi.fn(async () => stored) },
    }
    return req
  }
  const settle = () => new Promise((r) => setTimeout(r, 80))

  it('waits for the commit, re-reads, and asks for E8 once', async () => {
    vi.mocked(notifyAfterChange).mockClear()
    const req = harnessE8(doc)
    ;(notifyPublished as CollectionAfterChangeHook)({ doc, previousDoc: previous, req } as never)
    await settle()
    expect(notifyAfterChange).not.toHaveBeenCalled()
    req.transactionID = undefined
    await settle()
    expect(notifyAfterChange).toHaveBeenCalledTimes(1)
    expect(notifyAfterChange).toHaveBeenCalledWith('E8', expect.objectContaining({ businessId: 9 }))
  })

  it('sends nothing when the publish rolled back (the listing is still a draft)', async () => {
    vi.mocked(notifyAfterChange).mockClear()
    const req = harnessE8({ ...doc, _status: 'draft' })
    req.transactionID = undefined
    ;(notifyPublished as CollectionAfterChangeHook)({ doc, previousDoc: previous, req } as never)
    await settle()
    expect(notifyAfterChange).not.toHaveBeenCalled()
  })

  it('ignores renewals, other saves and listings without a submission', async () => {
    vi.mocked(notifyAfterChange).mockClear()
    for (const prev of [
      { _status: 'draft', submission: { status: 'expired' } },
      { _status: 'published', submission: { status: 'approved' } },
      { _status: 'draft' },
    ]) {
      const req = harnessE8(doc)
      req.transactionID = undefined
      ;(notifyPublished as CollectionAfterChangeHook)({ doc, previousDoc: prev, req } as never)
    }
    await settle()
    expect(notifyAfterChange).not.toHaveBeenCalled()
  })
})

describe('refusePublishingUnfinished: a live listing cannot become a form state', () => {
  it.each(['incomplete', 'abandoned'])('refuses setting %s on a published listing', (status) => {
    expect(() =>
      refusePublishingUnfinished({
        data: { submission: { status } },
        originalDoc: { _status: 'published', submission: { status: 'approved' } },
      } as never),
    ).toThrow(/published listing cannot be set/)
    // Also when the same save publishes it.
    expect(() =>
      refusePublishingUnfinished({
        data: { _status: 'published', submission: { status } },
        originalDoc: { _status: 'draft' },
      } as never),
    ).toThrow()
  })

  it('still lets a draft move between form states', () => {
    const data = { submission: { status: 'abandoned' } }
    expect(
      refusePublishingUnfinished({
        data,
        originalDoc: { _status: 'draft', submission: { status: 'incomplete' } },
      } as never),
    ).toBe(data)
  })
})
