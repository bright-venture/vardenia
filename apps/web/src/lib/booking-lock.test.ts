import { describe, expect, it, vi } from 'vitest'
import { lockBookingSlots } from './booking-lock'

/** The listing's booking lock: the trigger's key, on the save's own transaction. */
describe('lockBookingSlots', () => {
  it("takes the trigger's advisory lock on the request's transaction", async () => {
    const session = { execute: vi.fn(async () => ({ rows: [] })) }
    const pool = { execute: vi.fn(async () => ({ rows: [] })) }
    const req = {
      transactionID: Promise.resolve('tx1'),
      payload: { db: { drizzle: pool, sessions: { tx1: { db: session } } } },
    }
    await lockBookingSlots(req as never, 7)
    expect(pool.execute).not.toHaveBeenCalled()
    const queries = session.execute.mock.calls.map((call) => JSON.stringify((call as unknown[])[0]))
    expect(queries.length).toBe(1)
    expect(queries[0]).toContain('pg_advisory_xact_lock(hashtext(')
    // Exactly the string the capacity trigger hashes: 'vardenia.booking:' || business_id.
    expect(queries[0]).toContain('vardenia.booking:7')
  })

  it('does nothing without a database adapter', async () => {
    await expect(lockBookingSlots({ payload: {} } as never, 7)).resolves.toBeUndefined()
  })
})
