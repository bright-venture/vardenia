import Link from 'next/link'
import { SUBMISSION_QUEUES, queueHref } from '../../lib/submission-queues'

/**
 * Quick filters above the Listings list: Submitted, Incomplete, Abandoned,
 * Rejected. Each is a link to the list filtered on the submission status, so
 * the list itself is untouched and "All listings" is always one click away.
 */
export function SubmissionQueues() {
  return (
    <nav aria-label="Submission queues" style={styles.row}>
      {SUBMISSION_QUEUES.map((queue) => (
        <Link key={queue.key} href={queueHref(queue.status)} style={styles.link}>
          {queue.label}
        </Link>
      ))}
    </nav>
  )
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0 0 var(--base)' },
  link: {
    padding: '0.25rem 0.75rem',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '999px',
    fontSize: '0.85rem',
    color: 'var(--theme-elevation-800)',
    textDecoration: 'none',
  },
}
