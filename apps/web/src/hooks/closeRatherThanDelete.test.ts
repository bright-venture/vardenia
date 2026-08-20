import { describe, expect, it, vi } from 'vitest'
import type { CollectionBeforeDeleteHook } from 'payload'
import { closeRatherThanDelete } from './closeRatherThanDelete'

/**
 * Two questions, and the answers are opposites.
 *
 * Nothing points at the row  -> let the delete happen, it leaves less behind.
 * Bookings point at the row  -> close it instead and say so.
 *
 * The message matters as much as the behaviour here, the same way it does in
 * blockMediaInUse: an error is the only way to call a delete off, so the wording
 * is the only thing telling the admin that the account was in fact closed.
 */

interface Options {
  bookings?: number
  deletedAt?: string | null
  cancelled?: number
}

function harness({ bookings = 0, deletedAt = null, cancelled = 0 }: Options = {}) {
  const updates: Record<string, unknown>[] = []

  const payload = {
    find: vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === 'bookings') {
        // `closeCustomerAccount` pages through them; the hook only counts.
        return { docs: [], totalDocs: bookings }
      }
      return { docs: [], totalDocs: 0 }
    }),
    findByID: vi.fn(async () => ({ id: 1, email: 'sami@example.com', deletedAt })),
    update: vi.fn(async (args: Record<string, unknown>) => {
      updates.push(args)
      return {}
    }),
  }

  // The cancellations happen inside closeCustomerAccount, which finds them
  // itself. Feed that find rather than stubbing the module.
  if (cancelled > 0) {
    let call = 0
    payload.find = vi.fn(async ({ collection }: { collection: string }) => {
      if (collection !== 'bookings') return { docs: [], totalDocs: 0 }
      call += 1
      // 1st: the hook's count. 2nd: upcoming to cancel. 3rd: all, for notes.
      if (call === 1) return { docs: [], totalDocs: bookings }
      if (call === 2) {
        return {
          docs: Array.from({ length: cancelled }, (_, i) => ({ id: i + 1 })),
          totalDocs: cancelled,
        }
      }
      return { docs: [], totalDocs: 0 }
    })
  }

  const run = () =>
    (closeRatherThanDelete as CollectionBeforeDeleteHook)({
      id: 1,
      req: { payload },
    } as never)

  return { run, payload, updates }
}

describe('closeRatherThanDelete', () => {
  it('lets a customer with no bookings be deleted outright', async () => {
    const { run, payload } = harness({ bookings: 0 })

    await expect(run()).resolves.toBeUndefined()
    // Nothing was anonymised on the way past - the row is simply going.
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('closes a customer with bookings instead of deleting them', async () => {
    const { run, updates } = harness({ bookings: 3 })

    await expect(run()).rejects.toThrow(/closed rather than deleted/i)

    const customer = updates.find((u) => u.collection === 'customers')
    expect(customer).toBeDefined()
    expect((customer?.data as { name?: string }).name).toBe('Closed account')
  })

  it('says why the row could not go', async () => {
    const { run } = harness({ bookings: 3 })
    await expect(run()).rejects.toThrow(/3 bookings still refer to it/)
  })

  it('counts one booking in the singular', async () => {
    const { run } = harness({ bookings: 1 })
    await expect(run()).rejects.toThrow(/1 booking still refers to it/)
  })

  it('mentions the cancellations when there were some', async () => {
    const { run } = harness({ bookings: 4, cancelled: 2 })
    await expect(run()).rejects.toThrow(/2 upcoming bookings cancelled with the venues told/)
  })

  it('says nothing about cancellations when every booking is in the past', async () => {
    const error = await harness({ bookings: 4 })
      .run()
      .catch((e: Error) => e)

    expect(String(error)).not.toMatch(/cancelled/)
  })

  /**
   * Closing twice would mint a second random address and move `deletedAt` to
   * today, rewriting when the closure actually happened. There is nothing left
   * to remove, so the second attempt only explains itself.
   */
  it('does not close an already closed account a second time', async () => {
    const { run, payload } = harness({ bookings: 2, deletedAt: '2026-08-01T00:00:00.000Z' })

    await expect(run()).rejects.toThrow(/already closed/)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('still refuses the delete for an already closed account', async () => {
    const { run } = harness({ bookings: 2, deletedAt: '2026-08-01T00:00:00.000Z' })
    await expect(run()).rejects.toThrow(/2 bookings still refer to it/)
  })
})
