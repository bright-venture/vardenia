import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

/**
 * The cap counted in the shared table, so a burst spread across server
 * instances still meets one ceiling. The store is faked: each key keeps its own
 * count, as the rate_limits table does.
 */
const counts = new Map<string, number>()
let unreachable = false

vi.mock('./rate-limit-store', () => ({
  counterKey: (scope: string, value: string) => `${scope}:${value}`,
  hit: async (_payload: unknown, key: string) => {
    if (unreachable) return null
    const count = (counts.get(key) ?? 0) + 1
    counts.set(key, count)
    return { count, resetAt: Date.now() + 3_600_000 }
  },
}))

const { checkSharedSendBudget } = await import('./email-cap')
const payload = {} as Payload

describe('the shared send cap', () => {
  it('allows five messages an hour to one address, across instances, and refuses the sixth', async () => {
    counts.clear()
    for (let i = 0; i < 5; i++) {
      expect(await checkSharedSendBudget(payload, ['Guest@Example.com'])).toEqual({ allowed: true })
    }
    expect(await checkSharedSendBudget(payload, ['guest@example.com'])).toMatchObject({
      allowed: false,
      reason: 'recipient',
    })
  })

  it('answers null when the store cannot be reached, so the caller falls back', async () => {
    unreachable = true
    expect(await checkSharedSendBudget(payload, ['guest@example.com'])).toBeNull()
    unreachable = false
  })
})
