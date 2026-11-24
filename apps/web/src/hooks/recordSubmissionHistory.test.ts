import { describe, expect, it } from 'vitest'
import type { CollectionBeforeChangeHook } from 'payload'
import { recordSubmissionHistory } from './recordSubmissionHistory'

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
