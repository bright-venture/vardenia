import { describe, expect, it } from 'vitest'
import type { CollectionBeforeValidateHook } from 'payload'
import { requireRejectionReason } from './requireRejectionReason'

const run = (data: Record<string, unknown>, originalDoc: Record<string, unknown> = {}) =>
  (requireRejectionReason as CollectionBeforeValidateHook)({
    data,
    originalDoc,
    operation: 'update',
  } as never)

describe('requireRejectionReason', () => {
  it('refuses setting Rejected by hand with no reason', () => {
    expect(() =>
      run({ submission: { status: 'rejected' } }, { submission: { status: 'pending' } }),
    ).toThrow(/needs a reason/)
    expect(() =>
      run(
        { submission: { status: 'rejected', rejectionReason: '   ' } },
        { submission: { status: 'pending' } },
      ),
    ).toThrow(/needs a reason/)
  })

  it('allows it with a reason, and leaves an already rejected record alone', () => {
    const data = { submission: { status: 'rejected', rejectionReason: 'Not in Lebanon' } }
    expect(run(data, { submission: { status: 'pending' } })).toBe(data)
    const old = { submission: { status: 'rejected' } }
    expect(run(old, { submission: { status: 'rejected' } })).toBe(old)
  })

  it('does not touch any other change', () => {
    const data = { submission: { status: 'approved' } }
    expect(run(data, { submission: { status: 'pending' } })).toBe(data)
  })
})
