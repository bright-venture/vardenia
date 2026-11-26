import type { CollectionBeforeChangeHook } from 'payload'

/**
 * What each step reads as in the history. The first group are submission
 * statuses (a line is added whenever the status changes); the second are the
 * money and admin actions of lib/place-payments, which may happen without
 * a status change (a part of the rest received, a refund, an extension).
 */
export const HISTORY_STEPS = [
  { label: 'Form started', value: 'incomplete' },
  { label: 'Sent by the owner, awaiting downpayment', value: 'awaiting_downpayment' },
  { label: 'In review (downpayment received or waived)', value: 'pending' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Approved (published)', value: 'approved' },
  { label: 'Abandoned (hold ran out)', value: 'abandoned' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Fully paid', value: 'paid' },
  { label: 'Lapsed', value: 'lapsed' },
  { label: 'Expired', value: 'expired' },
  { label: 'Downpayment received', value: 'downpayment_received' },
  { label: 'Payment of the rest received', value: 'balance_received' },
  { label: 'Refund sent', value: 'refund_sent' },
  { label: 'Downpayment waived', value: 'downpayment_waived' },
  { label: 'Money entry undone', value: 'payment_undone' },
  { label: 'Deadline extended', value: 'deadline_extended' },
  { label: 'Payment email resent', value: 'email_resent' },
] as const

export type HistoryStep = (typeof HISTORY_STEPS)[number]['value']

/**
 * Lines the payment engine adds in the same write, passed in the request
 * context (Payload merges a local call's `context` into `req.context`). Read
 * once and removed, so a later write on the same request never repeats them.
 */
export interface EngineHistory {
  entries: { step: HistoryStep; note?: string }[]
  /** The staff member who did it (the engine's transaction has no req.user). */
  by: number | string | null
}

export const ENGINE_HISTORY_KEY = 'placeSubmissionHistory'

type Entry = { step: string; at: string; by?: number | string | null; note?: string | null }

const idOf = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  const id = (value as { id?: unknown } | null | undefined)?.id
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

/**
 * Adds a line to `submission.history` whenever the submission status changes:
 * what happened, when, and who (the signed-in staff member; empty for the
 * owner's own steps, which have no account). Nothing about the owner is copied
 * into it, only the step and, for an engine action, a short note (an amount,
 * a reason).
 *
 * Append only: the earlier lines are always taken from the stored record, never
 * from the request, so a save cannot rewrite or drop the past. Staff cannot
 * edit the field either (read-only, create/update denied in the collection).
 */
export const recordSubmissionHistory: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const context = (req?.context ?? {}) as Record<string, unknown>
  const engine = context[ENGINE_HISTORY_KEY] as EngineHistory | undefined
  if (engine) delete context[ENGINE_HISTORY_KEY]

  const submission = data?.submission as Record<string, unknown> | undefined
  if (!submission) return data
  const next = submission.status
  const before = (originalDoc?.submission as { status?: string } | undefined)?.status
  const statusChanged = typeof next === 'string' && !!next && before !== next
  const extra = engine?.entries ?? []

  if (!statusChanged && extra.length === 0) {
    // No step happened. A history sent with the request is never kept: the
    // stored one is left exactly as it is.
    if (!('history' in submission)) return data
    const rest = { ...submission }
    delete rest.history
    return { ...data, submission: rest }
  }

  const past = ((originalDoc?.submission as { history?: Entry[] } | undefined)?.history ?? []).map(
    (line) => ({
      step: line.step,
      at: line.at,
      by: idOf(line.by),
      ...(line.note ? { note: line.note } : {}),
    }),
  )
  const user = req?.user as { collection?: string } | null | undefined
  const by = engine ? engine.by : user?.collection === 'users' ? idOf(user) : null
  const at = new Date().toISOString()
  const lines: Entry[] = extra.map((e) => ({
    step: e.step,
    at,
    by,
    ...(e.note ? { note: e.note.slice(0, 500) } : {}),
  }))
  // The status line, unless the engine's own line already says it.
  if (statusChanged && !lines.some((l) => l.step === next)) {
    lines.push({ step: next as string, at, by })
  }
  return { ...data, submission: { ...submission, history: [...past, ...lines] } }
}
