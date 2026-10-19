import type { PayloadRequest } from 'payload'
import type { sql } from '@payloadcms/db-postgres'

export interface Executor {
  execute: (query: ReturnType<typeof sql>) => Promise<{ rows?: Record<string, unknown>[] }>
}

/**
 * The connection a save is running on, so a lock taken here lasts until that
 * save commits.
 *
 * Payload opens a transaction for every create and update and keeps its
 * connection in the adapter's `sessions`, keyed by the request's transaction
 * id. This is the same lookup Payload's own `getTransaction` does, which the
 * adapter does not export. Outside a transaction it falls back to the pool,
 * where a lock lasts only for its own statement - harmless, and no worse than
 * not locking. Null when there is no database adapter in reach at all.
 */
export async function transactionDb(req: PayloadRequest): Promise<Executor | null> {
  const adapter = req.payload?.db as
    | {
        drizzle?: Executor
        sessions?: Record<string | number, { db?: Executor } | undefined>
      }
    | undefined
  if (!adapter?.drizzle) return null

  const transaction = req.transactionID ? await req.transactionID : undefined
  return (
    (transaction !== undefined ? adapter.sessions?.[transaction]?.db : undefined) ?? adapter.drizzle
  )
}
