import type { Payload, Where } from 'payload'
import { isStaffUser } from '../access/index'
import { rawDb } from './db'

/**
 * The quick filters above the Listings list, the counts beside them, and the
 * same counts on the admin home (PRD v4 section 7.1, Task 11a).
 *
 * Each chip is one Payload `where`. The same object makes the chip's link and
 * its count, so a count always matches what the click shows: the link puts it
 * in the address (the list is Payload's own, so paging, search, columns and the
 * Filters panel keep working), and the count turns it into SQL (below).
 *
 * The `where` is written as `or: [{ and: [...] }]` because that is the shape
 * Payload's Filters panel reads back. A chip's filter therefore shows up under
 * Filters, where staff can add an issue, a governorate or a kind to it.
 *
 * Nothing is hidden from the default view: no base filter, no default sort on
 * the collection (a collection sort would also order the public directory, see
 * hooks/guardSort). The sort travels in each chip's link instead.
 */

export const LIST_HREF = '/admin/collections/businesses'

const DAY = 86_400_000

/** "Deadline soon" means within this many days (PRD A15). */
export const DEADLINE_SOON_DAYS = 3

const STATUS = 'submission.status'
const STAGE = 'submission.payment.stage'
const DOWNPAYMENT_DUE = 'submission.payment.downpaymentDueAt'
const BALANCE_DUE = 'submission.payment.balanceDueAt'

/** Statuses after which nothing more happens to a submission. */
export const CLOSED_STATUSES = ['rejected', 'lapsed', 'abandoned', 'expired'] as const

export type QueueKey =
  | 'awaiting-downpayment'
  | 'to-review'
  | 'awaiting-rest'
  | 'ready-to-publish'
  | 'refunds'
  | 'closed'
  | 'incomplete'
  | 'all'
  | 'sample'
  | 'real'

export interface Queue {
  key: QueueKey
  label: string
  /** What the chip is for, as its tooltip. */
  hint: string
  where: Where | null
  /**
   * The order the chip opens in: the deadline that drives it, nearest first
   * (nulls last), or the oldest waiting. Always set, because Payload saves the
   * sort of the last list opened; without one here, "All" would keep the sort
   * of whichever chip was clicked before.
   */
  sort: string
}

/** One condition set, in the shape the Filters panel reads back. */
const only = (...conditions: Where[]): Where => ({ or: [{ and: conditions }] })

export const SUBMISSION_QUEUES: readonly Queue[] = [
  {
    key: 'awaiting-downpayment',
    label: 'Awaiting downpayment',
    hint: 'Sent; the owner still has to pay the downpayment. Nearest deadline first.',
    where: only({ [STATUS]: { equals: 'awaiting_downpayment' } }),
    sort: DOWNPAYMENT_DUE,
  },
  {
    key: 'to-review',
    label: 'Downpayment received, to review',
    hint: 'Downpayment received (or waived). Accept or reject. Longest waiting first.',
    where: only({ [STATUS]: { equals: 'pending' } }),
    sort: 'submission.submittedAt',
  },
  {
    key: 'awaiting-rest',
    label: 'Accepted, awaiting the rest',
    hint: 'Accepted; the rest of the price is due. Nearest deadline first.',
    where: only({ [STATUS]: { equals: 'accepted' } }),
    sort: BALANCE_DUE,
  },
  {
    key: 'ready-to-publish',
    label: 'Fully paid, ready to publish',
    hint: 'Everything is paid. Publish them. Longest waiting first.',
    where: only({ [STATUS]: { equals: 'paid' } }),
    sort: 'submission.submittedAt',
  },
  {
    key: 'refunds',
    label: 'Refunds to send',
    hint: 'Not accepted after paying: send the money back by Whish, then press Refund sent.',
    where: only({ [STAGE]: { equals: 'refund_due' } }),
    sort: 'submission.rejectedAt',
  },
  {
    key: 'closed',
    label: 'Closed',
    hint: 'Rejected, lapsed, abandoned or expired. Most recent first.',
    where: only({ [STATUS]: { in: [...CLOSED_STATUSES] } }),
    sort: '-updatedAt',
  },
  {
    key: 'incomplete',
    label: 'Incomplete',
    hint: 'Forms still being filled in. Their number is held for a short while.',
    where: only({ [STATUS]: { equals: 'incomplete' } }),
    sort: '-createdAt',
  },
  {
    key: 'all',
    label: 'All',
    hint: 'Every listing, with or without a form.',
    where: null,
    sort: '-createdAt',
  },
  {
    key: 'sample',
    label: 'Sample listings',
    hint: 'Placeholder listings flagged as samples. They carry no number and stay out of the contract report.',
    where: only({ isSample: { equals: true } }),
    sort: '-createdAt',
  },
  {
    key: 'real',
    label: 'Real listings',
    hint: 'Every listing that is not a sample.',
    where: only({ isSample: { not_equals: true } }),
    sort: '-createdAt',
  },
]

export type DeadlineKey = 'due-soon' | 'overdue' | 'due-within'

export interface DeadlineFilter {
  key: DeadlineKey
  label: string
  where: Where
  sort: string
}

/**
 * The deadline that is running for a submission: the downpayment while it is
 * awaited, the rest once accepted. Anything else has no live deadline.
 */
const running = (dueBefore: string | null, dueFrom: string | null): Where => {
  const range = (path: string): Where[] => [
    ...(dueFrom ? [{ [path]: { greater_than_equal: dueFrom } }] : []),
    ...(dueBefore ? [{ [path]: { less_than: dueBefore } }] : []),
  ]
  return {
    or: [
      { and: [{ [STATUS]: { equals: 'awaiting_downpayment' } }, ...range(DOWNPAYMENT_DUE)] },
      { and: [{ [STATUS]: { equals: 'accepted' } }, ...range(BALANCE_DUE)] },
    ],
  }
}

/**
 * Deadline filters, as of `now`:
 * - due-soon: still open, ending within DEADLINE_SOON_DAYS
 * - overdue: already passed (the job lapses or rejects these every 15 minutes,
 *   so anything here for long means the job is not running)
 * - due-within: both of the above, for the admin home counter
 *
 * Sorted on the downpayment deadline: one order across both deadlines needs a
 * stored "next deadline" column, which is a schema change (see the report).
 */
export function deadlineFilters(now: Date): Record<DeadlineKey, DeadlineFilter> {
  const nowIso = now.toISOString()
  const soonIso = new Date(now.getTime() + DEADLINE_SOON_DAYS * DAY).toISOString()
  const sort = DOWNPAYMENT_DUE
  return {
    'due-soon': {
      key: 'due-soon',
      label: `Deadline within ${DEADLINE_SOON_DAYS} days`,
      where: running(soonIso, nowIso),
      sort,
    },
    overdue: { key: 'overdue', label: 'Deadline passed', where: running(nowIso, null), sort },
    'due-within': {
      key: 'due-within',
      label: `Deadline within ${DEADLINE_SOON_DAYS} days or passed`,
      where: running(soonIso, null),
      sort,
    },
  }
}

/* ------------------------------------------------------------------ links */

/** A `where` as address parameters, in the bracket form Payload reads. */
export function whereParams(where: Where | null, prefix = 'where'): [string, string][] {
  if (!where) return []
  const out: [string, string][] = []
  const walk = (key: string, value: unknown) => {
    if (Array.isArray(value)) value.forEach((item, i) => walk(`${key}[${i}]`, item))
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(`${key}[${k}]`, v)
    } else out.push([key, String(value)])
  }
  walk(prefix, where)
  return out
}

/** The list address for a filter and a sort. */
export function listHref(where: Where | null, sort?: string): string {
  const params = [...whereParams(where), ...(sort ? ([['sort', sort]] as [string, string][]) : [])]
  if (params.length === 0) return LIST_HREF
  return `${LIST_HREF}?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`
}

export const queueHref = (key: QueueKey): string => {
  const queue = SUBMISSION_QUEUES.find((q) => q.key === key)!
  return listHref(queue.where, queue.sort)
}

/**
 * Whether the address shows this filter. Values that are instants (deadline
 * filters carry "now") are compared by key only, so the chip stays marked
 * after the clock moves on.
 */
export function isShowing(
  where: Where | null,
  searchParams: Record<string, string | string[] | undefined> | undefined,
): boolean {
  const current = Object.entries(searchParams ?? {})
    .filter(([key]) => key.startsWith('where'))
    .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value] as const)
  const wanted = whereParams(where)
  if (current.length !== wanted.length) return false
  if (!where) return !(searchParams?.search ?? '')
  const instant = /^\d{4}-\d{2}-\d{2}T/
  return wanted.every(([key, value]) => {
    const found = current.find(([k]) => k === key)
    if (!found) return false
    return instant.test(value) ? true : found[1] === value
  })
}

/* ----------------------------------------------------------------- counts */

/**
 * The columns a chip filter may name, and nothing else. A path outside this
 * list is a programming error and throws: the SQL below interpolates only these
 * constants, never a path or a value from a request.
 */
const COLUMNS: Record<string, { column: string; type: 'text' | 'timestamptz' | 'boolean' }> = {
  [STATUS]: { column: 'submission_status', type: 'text' },
  [STAGE]: { column: 'submission_payment_stage', type: 'text' },
  [DOWNPAYMENT_DUE]: { column: 'submission_payment_downpayment_due_at', type: 'timestamptz' },
  [BALANCE_DUE]: { column: 'submission_payment_balance_due_at', type: 'timestamptz' },
  isSample: { column: 'is_sample', type: 'boolean' },
}

/**
 * A chip's `where` as a SQL condition, every value bound as a parameter.
 * Supports what the chips use: and, or, equals, not_equals, in,
 * less_than, greater_than_equal. An empty `and` is true; an empty `or` is false.
 */
export function whereToSql(where: Where, values: unknown[]): string {
  const parts: string[] = []
  for (const [key, condition] of Object.entries(where)) {
    if (key === 'and' || key === 'or') {
      const list = (condition as Where[]).map((w) => whereToSql(w, values))
      if (list.length === 0) parts.push(key === 'and' ? 'true' : 'false')
      else parts.push(`(${list.join(key === 'and' ? ' and ' : ' or ')})`)
      continue
    }
    const target = COLUMNS[key]
    if (!target) throw new Error(`submission-queues: no column for ${JSON.stringify(key)}`)
    const column = target.type === 'text' ? `"${target.column}"::text` : `"${target.column}"`
    for (const [operator, value] of Object.entries(condition as Record<string, unknown>)) {
      values.push(value)
      const p = `$${values.length}`
      const cast = target.type === 'timestamptz' ? '::timestamptz' : ''
      switch (operator) {
        case 'equals':
          parts.push(`${column} = ${p}${cast}`)
          break
        case 'not_equals':
          parts.push(`${column} <> ${p}${cast}`)
          break
        case 'in':
          parts.push(`${column} = any(${p}::${target.type}[])`)
          break
        case 'less_than':
          parts.push(`${column} < ${p}${cast}`)
          break
        case 'greater_than_equal':
          parts.push(`${column} >= ${p}${cast}`)
          break
        default:
          throw new Error(`submission-queues: operator ${operator} is not supported`)
      }
    }
  }
  return parts.length === 0 ? 'true' : parts.length === 1 ? parts[0]! : `(${parts.join(' and ')})`
}

export type QueueCounts = Record<QueueKey | DeadlineKey, number>

/** Every counted filter, in the column order of countQuery (c0, c1, ...). */
export const countedKeys = (now: Date): { key: QueueKey | DeadlineKey; where: Where | null }[] => [
  ...SUBMISSION_QUEUES.map((q) => ({ key: q.key, where: q.where })),
  ...Object.values(deadlineFilters(now)).map((d) => ({ key: d.key, where: d.where })),
]

/**
 * Every count in one statement: `count(*) filter (where ...)` per chip, over
 * the listings not in the trash (the list hides the trash too). One
 * connection, one round trip, however many chips there are.
 */
export function countQuery(table: string, now: Date): { text: string; values: unknown[] } {
  const values: unknown[] = []
  const columns = countedKeys(now).map(({ where }, i) =>
    where
      ? `count(*) filter (where ${whereToSql(where, values)})::int as c${i}`
      : `count(*)::int as c${i}`,
  )
  return { text: `select ${columns.join(', ')} from ${table} where deleted_at is null`, values }
}

/** The row back from countQuery, keyed. */
export function countsFromRow(row: Record<string, unknown>, now: Date): QueueCounts {
  const counts = {} as QueueCounts
  countedKeys(now).forEach(({ key }, i) => {
    const n = Number(row[`c${i}`] ?? 0)
    counts[key] = Number.isFinite(n) ? n : 0
  })
  return counts
}

/**
 * The chip counts, for staff only (null for anyone else, before any query).
 *
 * Raw SQL, like lib/dashboard-stats: Payload has no grouped count, and eleven
 * `payload.count` calls would hold eleven connections of a pool of ten. Only
 * numbers leave this function, never a row, and the caller is checked first.
 */
export async function loadQueueCounts(
  payload: Payload,
  user: unknown,
  now = new Date(),
): Promise<QueueCounts | null> {
  if (!isStaffUser(user)) return null
  const db = rawDb(payload)
  const { text, values } = countQuery(`"${db.schema}"."${db.table('businesses')}"`, now)
  const result = await db.pool.query(text, values)
  return countsFromRow(result.rows[0] ?? {}, now)
}

/* ------------------------------------------------------------ list cells */

/** Short labels for the list (the field's own labels are written for the form). */
export const STATUS_LABELS: Record<string, string> = {
  incomplete: 'Incomplete',
  abandoned: 'Abandoned',
  awaiting_downpayment: 'Awaiting downpayment',
  pending: 'In review',
  accepted: 'Accepted, awaiting the rest',
  paid: 'Fully paid',
  lapsed: 'Lapsed',
  approved: 'Published',
  rejected: 'Rejected',
  expired: 'Expired',
}

export const STAGE_LABELS: Record<string, string> = {
  none: 'Nothing paid',
  downpayment_paid: 'Downpayment paid',
  waived: 'Downpayment waived',
  fully_paid: 'Fully paid',
  refund_due: 'Refund to send',
  refunded: 'Refunded',
  kept: 'Downpayment kept',
}

export type Tone = 'ok' | 'warn' | 'bad' | 'off' | 'plain'

/** Waiting on us: warn. Done well: ok. Over: off. */
export const STATUS_TONE: Record<string, Tone> = {
  incomplete: 'off',
  abandoned: 'off',
  awaiting_downpayment: 'plain',
  pending: 'warn',
  accepted: 'plain',
  paid: 'warn',
  lapsed: 'off',
  approved: 'ok',
  rejected: 'off',
  expired: 'off',
}

export interface SubmissionRow {
  status?: string | null
  rejectionKind?: string | null
  payment?: {
    stage?: string | null
    downpaymentDueAt?: string | null
    balanceDueAt?: string | null
  } | null
}

export interface RunningDeadline {
  which: 'downpayment' | 'balance'
  at: Date
}

/** The deadline a submission is running against now, if any. */
export function nextDeadline(submission: SubmissionRow | null | undefined): RunningDeadline | null {
  const status = submission?.status
  const raw =
    status === 'awaiting_downpayment'
      ? submission?.payment?.downpaymentDueAt
      : status === 'accepted'
        ? submission?.payment?.balanceDueAt
        : null
  if (!raw) return null
  const at = new Date(raw)
  if (Number.isNaN(at.getTime())) return null
  return { which: status === 'accepted' ? 'balance' : 'downpayment', at }
}

/**
 * "4 days left", "Under a day left", "Overdue", "Overdue 3 days", with the
 * tone: overdue is bad, within DEADLINE_SOON_DAYS a warning.
 */
export function deadlineText(at: Date, now: Date): { text: string; tone: Tone } {
  const ms = at.getTime() - now.getTime()
  if (ms <= 0) {
    const days = Math.floor(-ms / DAY)
    return {
      text: days >= 1 ? `Overdue ${days} day${days === 1 ? '' : 's'}` : 'Overdue',
      tone: 'bad',
    }
  }
  const days = Math.floor(ms / DAY)
  const text = days === 0 ? 'Under a day left' : `${days} day${days === 1 ? '' : 's'} left`
  return { text, tone: ms <= DEADLINE_SOON_DAYS * DAY ? 'warn' : 'plain' }
}
