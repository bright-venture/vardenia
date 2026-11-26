import type { PayloadRequest } from 'payload'

import { reportError } from './report'

/**
 * Runs `fn` once the transaction of `req` has ended.
 *
 * Payload has no hook after a commit: afterChange and afterOperation run
 * inside the transaction. Payload deletes `req.transactionID` when it commits
 * or rolls back (utilities/commitTransaction, killTransaction), so this waits
 * for that, checking every `intervalMs`, for at most `timeoutMs`. It cannot
 * tell a commit from a rollback: `fn` must read the record again to see what
 * really happened. Never throws; failures of `fn` are reported.
 */
export function afterCommit(
  req: Pick<PayloadRequest, 'transactionID'>,
  fn: () => Promise<void>,
  { intervalMs = 50, timeoutMs = 60_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): void {
  const run = () => {
    fn().catch(async (error) => {
      await reportError(error, { source: 'after-commit', level: 'warning' }).catch(() => {})
    })
  }
  const started = Date.now()
  const tick = () => {
    if (!req.transactionID) return run()
    if (Date.now() - started > timeoutMs) {
      void reportError(new Error('transaction did not end in time'), {
        source: 'after-commit',
        level: 'warning',
      }).catch(() => {})
      return
    }
    setTimeout(tick, intervalMs)
  }
  setTimeout(tick, 0)
}
