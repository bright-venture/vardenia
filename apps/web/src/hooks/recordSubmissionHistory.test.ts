import { describe, expect, it } from 'vitest'
import type { CollectionBeforeChangeHook } from 'payload'
import { HISTORY_STEPS, recordSubmissionHistory } from './recordSubmissionHistory'

const run = (
  data: Record<string, unknown>,
  originalDoc: Record<string, unknown> | undefined,
  user: unknown = null,
) =>
  (recordSubmissionHistory as CollectionBeforeChangeHook)({
    data,
    originalDoc,
    operation: originalDoc ? 'update' : 'create',
    req: { user },
  } as never) as { submission?: { history?: Record<string, unknown>[] } }

const staff = { id: 5, collection: 'users', roles: ['staff'] }

describe('recordSubmissionHistory', () => {
  it('records the form being started on create, with nobody as the actor', () => {
    const out = run({ submission: { status: 'incomplete' } }, undefined)
    expect(out.submission?.history).toHaveLength(1)
    expect(out.submission?.history?.[0]).toMatchObject({ step: 'incomplete', by: null })
    expect(typeof out.submission?.history?.[0]?.at).toBe('string')
  })

  it('records the owner finishing (no account) and keeps the earlier lines', () => {
    const past = [{ step: 'incomplete', at: '2026-11-23T10:00:00.000Z' }]
    const out = run(
      { submission: { status: 'pending' } },
      { submission: { status: 'incomplete', history: past } },
    )
    expect(out.submission?.history?.map((h) => h.step)).toEqual(['incomplete', 'pending'])
    expect(out.submission?.history?.[1]?.by).toBeNull()
  })

  it('records who rejected', () => {
    const out = run(
      { submission: { status: 'rejected' } },
      { submission: { status: 'pending' } },
      staff,
    )
    expect(out.submission?.history).toMatchObject([{ step: 'rejected', by: 5 }])
  })

  it('records publishing as approved, by the staff member', () => {
    const out = run(
      { submission: { status: 'approved' } },
      { submission: { status: 'pending' } },
      staff,
    )
    expect(out.submission?.history?.[0]).toMatchObject({ step: 'approved', by: 5 })
  })

  it('does not name a partner or guest account as a staff actor', () => {
    const out = run(
      { submission: { status: 'pending' } },
      { submission: { status: 'incomplete' } },
      { id: 9, collection: 'business-users' },
    )
    expect(out.submission?.history?.[0]?.by).toBeNull()
  })

  it('adds nothing when the status does not change, and never keeps a history from the request', () => {
    const forged = [{ step: 'approved', at: '2026-01-01T00:00:00.000Z' }]
    const out = run(
      { submission: { status: 'pending', history: forged } },
      { submission: { status: 'pending' } },
    )
    expect(out.submission).toEqual({ status: 'pending' })
  })

  it('takes the past from the stored record, not from a forged one in the request', () => {
    const stored = [{ step: 'incomplete', at: '2026-11-23T10:00:00.000Z', by: { id: 4 } }]
    const forged = [{ step: 'approved', at: '2026-01-01T00:00:00.000Z' }]
    const out = run(
      { submission: { status: 'pending', history: forged } },
      { submission: { status: 'incomplete', history: stored } },
    )
    expect(out.submission?.history?.map((h) => h.step)).toEqual(['incomplete', 'pending'])
    expect(out.submission?.history?.[0]?.by).toBe(4)
  })

  it('holds nothing about the owner', () => {
    const out = run(
      { submission: { status: 'pending', ownerEmail: 'a@b.c', ownerName: 'A' } },
      {
        submission: { status: 'incomplete' },
      },
    )
    expect(JSON.stringify(out.submission?.history)).not.toMatch(/a@b\.c|"A"/)
  })

  it('leaves a save without a submission alone', () => {
    const data = { name: 'x' }
    expect(run(data, {})).toBe(data)
  })
})

describe('recordSubmissionHistory: engine lines', () => {
  const runWith = (
    data: Record<string, unknown>,
    originalDoc: Record<string, unknown> | undefined,
    context: Record<string, unknown>,
    user: unknown = null,
  ) =>
    (recordSubmissionHistory as CollectionBeforeChangeHook)({
      data,
      originalDoc,
      operation: 'update',
      req: { user, context },
    } as never) as { submission?: { history?: Record<string, unknown>[] } }

  it('adds the engine line with its note and actor, then the status line', () => {
    const context = {
      placeSubmissionHistory: {
        entries: [{ step: 'downpayment_received', note: '$500 by Whish' }],
        by: 7,
      },
    }
    const out = runWith(
      { submission: { status: 'pending' } },
      {
        submission: { status: 'awaiting_downpayment', history: [{ step: 'incomplete', at: 'x' }] },
      },
      context,
    )
    expect(out.submission?.history).toMatchObject([
      { step: 'incomplete' },
      { step: 'downpayment_received', note: '$500 by Whish', by: 7 },
      { step: 'pending', by: 7 },
    ])
    // Read once: a second write on the same request adds nothing.
    expect('placeSubmissionHistory' in context).toBe(false)
  })

  it('records an engine action that does not change the status', () => {
    const out = runWith(
      { submission: { status: 'accepted', history: [{ step: 'forged', at: 'x' }] } },
      { submission: { status: 'accepted', history: [{ step: 'accepted', at: 'y', by: 2 }] } },
      { placeSubmissionHistory: { entries: [{ step: 'balance_received', note: '$200' }], by: 3 } },
    )
    expect(out.submission?.history).toMatchObject([
      { step: 'accepted', at: 'y', by: 2 },
      { step: 'balance_received', note: '$200', by: 3 },
    ])
    expect(out.submission?.history).toHaveLength(2)
  })

  it('does not repeat the status when the engine line already names it', () => {
    const out = runWith(
      { submission: { status: 'accepted' } },
      { submission: { status: 'pending' } },
      {
        placeSubmissionHistory: { entries: [{ step: 'accepted', note: 'rest due 24 Dec' }], by: 3 },
      },
    )
    expect(out.submission?.history).toMatchObject([{ step: 'accepted', note: 'rest due 24 Dec' }])
    expect(out.submission?.history).toHaveLength(1)
  })

  it('keeps the notes of earlier lines', () => {
    const out = run(
      { submission: { status: 'rejected' } },
      {
        submission: {
          status: 'pending',
          history: [{ step: 'downpayment_received', at: 'a', note: '$500' }],
        },
      },
      staff,
    )
    expect(out.submission?.history?.[0]).toMatchObject({ note: '$500' })
  })

  it('every step has a label and the new statuses are steps', () => {
    const values = HISTORY_STEPS.map((s) => s.value)
    for (const v of ['awaiting_downpayment', 'paid', 'downpayment_received', 'refund_sent']) {
      expect(values).toContain(v)
    }
    expect(new Set(values).size).toBe(values.length)
  })
})
