import { describe, expect, it } from 'vitest'
import type { CollectionBeforeChangeHook } from 'payload'
import { typicalAnswerHours } from './answer-time'
import { stampAnsweredAt } from '../hooks/stampAnsweredAt'

const HOUR = 3_600_000
const at = (hoursAfter: number) => ({
  createdAt: '2026-09-01T10:00:00.000Z',
  answeredAt: new Date(Date.parse('2026-09-01T10:00:00.000Z') + hoursAfter * HOUR).toISOString(),
})

describe('typicalAnswerHours', () => {
  it('is the median wait, rounded up so "within" is true', () => {
    expect(typicalAnswerHours([at(0.5), at(2.2), at(40)])).toBe(3)
  })

  it('says within an hour for quick venues, never zero', () => {
    expect(typicalAnswerHours([at(0.1), at(0.2), at(0.4)])).toBe(1)
  })

  it('needs at least three answers', () => {
    expect(typicalAnswerHours([at(1), at(2)])).toBeNull()
  })

  it('says nothing for a venue slower than a day', () => {
    expect(typicalAnswerHours([at(30), at(40), at(50)])).toBeNull()
  })

  it('ignores answers with no time', () => {
    expect(typicalAnswerHours([at(1), at(2), { createdAt: 'x', answeredAt: null }])).toBeNull()
  })
})

describe('stampAnsweredAt', () => {
  type Args = Parameters<CollectionBeforeChangeHook>[0]
  const run = (args: {
    data: Record<string, unknown>
    originalDoc?: Record<string, unknown>
    operation: 'create' | 'update'
    user?: { collection: string } | null
  }) =>
    stampAnsweredAt({
      data: args.data,
      originalDoc: args.originalDoc,
      operation: args.operation,
      req: { user: args.user ?? null },
    } as unknown as Args) as Record<string, unknown>

  it('stamps the first answer by the venue', () => {
    const out = run({
      data: { status: 'confirmed' },
      originalDoc: { status: 'pending', answeredAt: null },
      operation: 'update',
      user: { collection: 'business-users' },
    })
    expect(typeof out.answeredAt).toBe('string')
  })

  it('counts staff answering for the venue', () => {
    const out = run({
      data: { status: 'cancelled' },
      originalDoc: { status: 'pending' },
      operation: 'update',
      user: { collection: 'users' },
    })
    expect(typeof out.answeredAt).toBe('string')
  })

  it('does not count a guest cancelling their own request', () => {
    const out = run({
      data: { status: 'cancelled' },
      originalDoc: { status: 'pending' },
      operation: 'update',
      user: { collection: 'customers' },
    })
    expect(out.answeredAt).toBeNull()
  })

  it('never stamps on create, so automatic confirmations are not answers', () => {
    const out = run({ data: { status: 'confirmed', answeredAt: 'x' }, operation: 'create' })
    expect(out.answeredAt).toBeNull()
  })

  it('keeps the first answer, whatever a later request sends', () => {
    const out = run({
      data: { status: 'completed', answeredAt: '2020-01-01T00:00:00.000Z' },
      originalDoc: { status: 'confirmed', answeredAt: '2026-09-01T12:00:00.000Z' },
      operation: 'update',
      user: { collection: 'business-users' },
    })
    expect(out.answeredAt).toBe('2026-09-01T12:00:00.000Z')
  })
})
