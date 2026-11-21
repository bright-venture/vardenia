import { describe, expect, it, vi } from 'vitest'

// Only createLocalReq is replaced (it needs a full config); the transaction
// helpers are Payload's own.
vi.mock('payload', async (importOriginal) => {
  const real = await importOriginal<typeof import('payload')>()
  return {
    ...real,
    createLocalReq: vi.fn(async (_args: unknown, payload: unknown) => ({ payload, context: {} })),
  }
})

const { advisoryLock, runInTransaction } = await import('./branches')

const fakePayload = () => {
  const db = {
    beginTransaction: vi.fn(async () => 'tx1'),
    commitTransaction: vi.fn(async () => {}),
    rollbackTransaction: vi.fn(async () => {}),
  }
  return { db, payload: { db } }
}

/** The one transaction a branch is written in (lib/branches). */
describe('runInTransaction', () => {
  it('commits when the work succeeds, on a request with no user', async () => {
    const { db, payload } = fakePayload()
    const seen: Record<string, unknown>[] = []
    const result = await runInTransaction(payload as never, async (req) => {
      seen.push({ tx: req.transactionID, user: req.user })
      return 42
    })
    expect(result).toBe(42)
    expect(seen).toEqual([{ tx: 'tx1', user: undefined }])
    expect(db.commitTransaction).toHaveBeenCalledWith('tx1')
    expect(db.rollbackTransaction).not.toHaveBeenCalled()
  })

  it('rolls back and rethrows when the work fails', async () => {
    const { db, payload } = fakePayload()
    await expect(
      runInTransaction(payload as never, async () => {
        throw new Error('late step failed')
      }),
    ).rejects.toThrow('late step failed')
    expect(db.rollbackTransaction).toHaveBeenCalledWith('tx1')
    expect(db.commitTransaction).not.toHaveBeenCalled()
  })

  it('refuses to commit when a nested write already killed the transaction', async () => {
    const { db, payload } = fakePayload()
    await expect(
      runInTransaction(payload as never, async (req) => {
        // What Payload's killTransaction does when a nested operation fails.
        delete (req as { transactionID?: unknown }).transactionID
        return 1
      }),
    ).rejects.toThrow(/rolled back/)
    expect(db.commitTransaction).not.toHaveBeenCalled()
  })

  it('refuses to run without a transaction', async () => {
    const payload = { db: {} }
    await expect(runInTransaction(payload as never, async () => 1)).rejects.toThrow(/transaction/)
  })
})

describe('advisoryLock', () => {
  it("takes a transaction-scoped lock on the request's own connection", async () => {
    const session = { execute: vi.fn(async () => ({ rows: [] })) }
    const pool = { execute: vi.fn(async () => ({ rows: [] })) }
    const req = {
      transactionID: Promise.resolve('tx1'),
      payload: { db: { drizzle: pool, sessions: { tx1: { db: session } } } },
    }
    await advisoryLock(req as never, 'vardenia.branches.partner:3')
    expect(pool.execute).not.toHaveBeenCalled()
    const query = JSON.stringify((session.execute.mock.calls[0] as unknown[])[0])
    expect(query).toContain('pg_advisory_xact_lock(hashtext(')
    expect(query).toContain('vardenia.branches.partner:3')
  })
})
