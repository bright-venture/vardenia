import type { CollectionBeforeChangeHook } from 'payload'

/** What each submission status reads as in the history. Payment steps are not recorded here. */
export const HISTORY_STEPS = [
  { label: 'Form started', value: 'incomplete' },
  { label: 'Finished by the owner', value: 'pending' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Approved (published)', value: 'approved' },
  { label: 'Abandoned (hold ran out)', value: 'abandoned' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Lapsed', value: 'lapsed' },
  { label: 'Expired', value: 'expired' },
] as const

type Entry = { step: string; at: string; by?: number | string | null }

const idOf = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  const id = (value as { id?: unknown } | null | undefined)?.id
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

/**
 * Adds a line to `submission.history` whenever the submission status changes:
 * what happened, when, and who (the signed-in staff member; empty for the
 * owner's own steps, which have no account). Nothing about the owner is copied
 * into it, only the step.
 *
 * Append only: the earlier lines are always taken from the stored record, never
 * from the request, so a save cannot rewrite or drop the past. Staff cannot
 * edit the field either (read-only, create/update denied in the collection).
 */
export const recordSubmissionHistory: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const submission = data?.submission as Record<string, unknown> | undefined
  if (!submission) return data
  const next = submission.status
  const before = (originalDoc?.submission as { status?: string } | undefined)?.status

  if (typeof next !== 'string' || !next || before === next) {
    // No step happened. A history sent with the request is never kept: the
    // stored one is left exactly as it is.
    if (!('history' in submission)) return data
    const rest = { ...submission }
    delete rest.history
    return { ...data, submission: rest }
  }

  const past = ((originalDoc?.submission as { history?: Entry[] } | undefined)?.history ?? []).map(
    (line) => ({ step: line.step, at: line.at, by: idOf(line.by) }),
  )
  const user = req?.user as { collection?: string } | null | undefined
  const by = user?.collection === 'users' ? idOf(user) : null
  const entry: Entry = { step: next, at: new Date().toISOString(), by }
  return { ...data, submission: { ...submission, history: [...past, entry] } }
}
