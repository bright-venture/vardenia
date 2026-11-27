import Link from 'next/link'
import type { Payload } from 'payload'
import {
  SUBMISSION_QUEUES,
  deadlineFilters,
  isShowing,
  listHref,
  loadQueueCounts,
  type QueueCounts,
} from '../../lib/submission-queues'

/**
 * Quick filters above the Listings list, each with its live count (PRD v4
 * 7.1): Awaiting downpayment, To review, Awaiting the rest, Ready to publish,
 * Refunds to send, Closed, Incomplete, All. Then the deadline filters.
 *
 * Each is a link to Payload's own list with a filter and a sort in the address
 * (lib/submission-queues), so search, paging, columns and the Filters panel
 * (payment stage, status, issue, governorate, kind, submitted date) all keep
 * working on top of it. The counts are one SQL statement, for staff only.
 */

/** Chips whose rows wait on the team, so a non-zero count stands out. */
const ACTION = new Set(['to-review', 'ready-to-publish', 'refunds'])

interface Props {
  payload?: Payload
  user?: unknown
  searchParams?: Record<string, string | string[] | undefined>
}

export async function SubmissionQueues({ payload, user, searchParams }: Props) {
  const now = new Date()
  let counts: QueueCounts | null = null
  if (payload) {
    try {
      counts = await loadQueueCounts(payload, user, now)
    } catch (error) {
      // The chips still work without their numbers; the list must not fail.
      payload.logger.error({ err: error, msg: 'Listings quick filter counts failed' })
    }
  }
  const deadlines = deadlineFilters(now)

  return (
    <div style={styles.wrap}>
      <nav aria-label="Quick filters" style={styles.row}>
        {SUBMISSION_QUEUES.map((queue) => {
          const active = isShowing(queue.where, searchParams)
          const count = counts?.[queue.key]
          return (
            <Link
              key={queue.key}
              href={listHref(queue.where, queue.sort)}
              title={queue.hint}
              aria-current={active ? 'page' : undefined}
              style={{ ...styles.chip, ...(active ? styles.active : null) }}
            >
              {queue.label}
              {typeof count === 'number' ? (
                <span
                  style={{
                    ...styles.count,
                    ...(count > 0 && ACTION.has(queue.key) ? styles.countOn : null),
                  }}
                >
                  {count.toLocaleString('en')}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>
      <nav aria-label="Deadline filters" style={styles.row}>
        <span style={styles.label}>Deadlines:</span>
        {(['due-soon', 'overdue'] as const).map((key) => {
          const filter = deadlines[key]
          const active = isShowing(filter.where, searchParams)
          const count = counts?.[key]
          return (
            <Link
              key={key}
              href={listHref(filter.where, filter.sort)}
              aria-current={active ? 'page' : undefined}
              style={{ ...styles.chip, ...(active ? styles.active : null) }}
            >
              {filter.label}
              {typeof count === 'number' ? (
                <span
                  style={{
                    ...styles.count,
                    ...(count > 0 ? (key === 'overdue' ? styles.countBad : styles.countOn) : null),
                  }}
                >
                  {count.toLocaleString('en')}
                </span>
              ) : null}
            </Link>
          )
        })}
        <span style={styles.label}>
          More filters (payment stage, status, issue, governorate, kind (Category), submitted date):
          Filters, above.
        </span>
      </nav>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '0 0 var(--base)' },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.25rem 0.75rem',
    // Longhands, not `border`: `active` swaps borderColor, and React warns when
    // a rerender removes a longhand that a shorthand on the same element set.
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--theme-elevation-150)',
    borderRadius: '999px',
    fontSize: '0.85rem',
    color: 'var(--theme-elevation-800)',
    textDecoration: 'none',
  },
  active: {
    borderColor: 'var(--theme-elevation-800)',
    background: 'var(--theme-elevation-100)',
    fontWeight: 600,
  },
  count: {
    minWidth: '1.5rem',
    padding: '0 0.4rem',
    borderRadius: '999px',
    fontSize: '0.75rem',
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
    background: 'var(--theme-elevation-100)',
    color: 'var(--theme-elevation-700)',
  },
  countOn: { background: 'var(--theme-warning-100)', color: 'var(--theme-warning-800)' },
  countBad: { background: 'var(--theme-error-100)', color: 'var(--theme-error-800)' },
  label: { fontSize: '0.8rem', color: 'var(--theme-elevation-600)' },
}
