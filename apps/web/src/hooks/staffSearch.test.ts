import { describe, expect, it } from 'vitest'
import type { CollectionBeforeOperationHook } from 'payload'
import { staffSearch } from './staffSearch'

const run = (operation: string, args: Record<string, unknown>) =>
  (staffSearch as CollectionBeforeOperationHook)({ operation, args } as never) as Record<
    string,
    unknown
  >

describe('staffSearch', () => {
  const where = {
    or: [{ 'submission.ownerPhoneSearch': { like: '+961 3 123 456' } }, { name: { like: 'x' } }],
  }

  it('rewrites the phone term on a read and a count', () => {
    for (const op of ['read', 'count']) {
      const out = run(op, { where }) as { where: { or: unknown[] } }
      expect(out.where.or[0]).toEqual({ 'submission.ownerPhoneSearch': { like: '03123456' } })
    }
  })

  it('leaves other operations and queries without a where alone', () => {
    const args = { where }
    expect(run('update', args)).toBe(args)
    const none = {}
    expect(run('read', none)).toBe(none)
  })
})
