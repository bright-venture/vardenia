import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { EXPIRY_BATCH, expireUnansweredBookings, isSchedulerRequest } from './booking-expiry'

/**
 * Requests nobody answered, declined once their time has come.
 *
 * What matters is what it asks for and what it writes: only pending requests
 * whose start has passed, each written "if still pending", each marked as an
 * automatic decline so the guest gets the right email and the venue none.
 */

const NOW = new Date('2026-10-20T18:00:00.000Z')

function harness(due: { id: number }[], answered: number[] = [], broken: number[] = []) {
  const finds: Record<string, unknown>[] = []
  const updates: Record<string, unknown>[] = []
  const payload = {
    find: vi.fn(async (args: Record<string, unknown>) => {
      finds.push(args)
      return { docs: due }
    }),
    update: vi.fn(async (args: { where: unknown }) => {
      updates.push(args as Record<string, unknown>)
      const id = Number(/"id":\{"equals":(\d+)\}/.exec(JSON.stringify(args.where))?.[1])
      if (broken.includes(id)) throw new Error('database down')
      // An answered request no longer matches "status = pending".
      return { docs: answered.includes(id) ? [] : [{ id }], errors: [] }
    }),
  } as unknown as Payload
  return { payload, finds, updates }
}

describe('expireUnansweredBookings', () => {
  it('asks only for pending requests whose time has come, oldest first', async () => {
    const h = harness([])
    await expireUnansweredBookings(h.payload, NOW)
    expect(h.finds[0]).toMatchObject({
      collection: 'bookings',
      where: {
        and: [{ status: { equals: 'pending' } }, { start: { less_than_equal: NOW.toISOString() } }],
      },
      sort: 'start',
      limit: EXPIRY_BATCH,
    })
  })

  it('declines each one as an automatic decline, only if still pending', async () => {
    const h = harness([{ id: 1 }, { id: 2 }])
    await expect(expireUnansweredBookings(h.payload, NOW)).resolves.toEqual({
      declined: 2,
      failed: 0,
    })
    expect(h.updates[0]).toMatchObject({
      collection: 'bookings',
      where: { and: [{ id: { equals: 1 } }, { status: { equals: 'pending' } }] },
      data: { status: 'cancelled' },
      context: { autoDeclined: true },
    })
  })

  it('leaves alone a request the venue answered in the meantime', async () => {
    const h = harness([{ id: 1 }, { id: 2 }], [2])
    await expect(expireUnansweredBookings(h.payload, NOW)).resolves.toEqual({
      declined: 1,
      failed: 0,
    })
  })

  it('carries on past a failure and counts it', async () => {
    const h = harness([{ id: 1 }, { id: 2 }], [], [1])
    await expect(expireUnansweredBookings(h.payload, NOW)).resolves.toEqual({
      declined: 1,
      failed: 1,
    })
  })
})

describe('isSchedulerRequest', () => {
  it('accepts the scheduler secret as a bearer token', () => {
    expect(isSchedulerRequest('Bearer s3cret-value', 's3cret-value')).toBe(true)
  })

  it('refuses a wrong, partial or missing token', () => {
    expect(isSchedulerRequest('Bearer wrong', 's3cret-value')).toBe(false)
    expect(isSchedulerRequest('Bearer s3cret', 's3cret-value')).toBe(false)
    expect(isSchedulerRequest('s3cret-value', 's3cret-value')).toBe(false)
    expect(isSchedulerRequest(null, 's3cret-value')).toBe(false)
  })

  it('refuses everything when no secret is configured', () => {
    expect(isSchedulerRequest('Bearer ', '')).toBe(false)
    expect(isSchedulerRequest('Bearer    ', '   ')).toBe(false)
  })
})
