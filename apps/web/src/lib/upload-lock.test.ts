import { describe, expect, it, vi } from 'vitest'
import { UPLOAD_LOCK_TIMEOUT_MS, lockPartnerUploads } from './upload-lock'

/** The lock is taken on the create's own transaction, keyed by partner. */
describe('lockPartnerUploads', () => {
  it("takes a transaction-scoped advisory lock on the request's transaction", async () => {
    const session = { execute: vi.fn(async () => ({ rows: [] })) }
    const pool = { execute: vi.fn(async () => ({ rows: [] })) }
    const req = {
      transactionID: Promise.resolve('tx1'),
      payload: { db: { drizzle: pool, sessions: { tx1: { db: session } } } },
    }
    await lockPartnerUploads(req as never, 5)
    expect(pool.execute).not.toHaveBeenCalled()
    const queries = session.execute.mock.calls.map((call) => JSON.stringify((call as unknown[])[0]))
    expect(queries.length).toBe(3)
    // A bounded wait, the lock, then the session's own lock_timeout again.
    expect(queries[0]).toContain(`SET LOCAL lock_timeout = '${UPLOAD_LOCK_TIMEOUT_MS}ms'`)
    expect(queries[1]).toContain('pg_advisory_xact_lock(hashtext(')
    expect(queries[1]).toContain('vardenia.partner-upload:5')
    expect(queries[2]).toContain('SET LOCAL lock_timeout TO DEFAULT')
  })

  it('does nothing without a database adapter', async () => {
    await expect(lockPartnerUploads({ payload: {} } as never, 5)).resolves.toBeUndefined()
  })
})

describe('a partner with uploads already queued', () => {
  const reqWith = (lockError: unknown) => {
    const session = {
      execute: vi.fn(async (query: unknown) => {
        if (JSON.stringify(query).includes('pg_advisory_xact_lock')) throw lockError
        return { rows: [] }
      }),
    }
    return {
      transactionID: Promise.resolve('tx1'),
      payload: { db: { drizzle: session, sessions: { tx1: { db: session } } } },
    }
  }

  it('waits a few seconds at most', () => {
    expect(UPLOAD_LOCK_TIMEOUT_MS).toBeGreaterThanOrEqual(3_000)
    expect(UPLOAD_LOCK_TIMEOUT_MS).toBeLessThanOrEqual(5_000)
  })

  it('answers 429 in words when the wait times out, as pg reports it', async () => {
    const pgError = Object.assign(new Error('canceling statement due to lock timeout'), {
      code: '55P03',
    })
    await expect(lockPartnerUploads(reqWith(pgError) as never, 5)).rejects.toMatchObject({
      status: 429,
      message: expect.stringMatching(/uploads in progress/i),
    })
  })

  it('also when the driver wraps the pg error', async () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: Object.assign(new Error('lock timeout'), { code: '55P03' }),
    })
    await expect(lockPartnerUploads(reqWith(wrapped) as never, 5)).rejects.toMatchObject({
      status: 429,
    })
  })

  it('lets any other database error through unchanged', async () => {
    const other = Object.assign(new Error('connection lost'), { code: '08006' })
    await expect(lockPartnerUploads(reqWith(other) as never, 5)).rejects.toBe(other)
  })
})
