/**
 * The queues staff work through on the Listings list: one plain filter on
 * `submission.status` each. They are links to the normal list with a filter in
 * the address, so nothing is stored, nothing is hidden from the default view
 * (the list is the same list with or without them), and the State column keeps
 * working.
 */

export interface SubmissionQueue {
  key: string
  label: string
  /** submission.status value, or null for the whole list. */
  status: string | null
}

export const SUBMISSION_QUEUES: SubmissionQueue[] = [
  { key: 'all', label: 'All listings', status: null },
  { key: 'submitted', label: 'Submitted', status: 'pending' },
  { key: 'incomplete', label: 'Incomplete', status: 'incomplete' },
  { key: 'abandoned', label: 'Abandoned', status: 'abandoned' },
  { key: 'rejected', label: 'Rejected', status: 'rejected' },
]

const LIST = '/admin/collections/businesses'

/** The list address for a queue. */
export const queueHref = (status: string | null): string =>
  status ? `${LIST}?where[submission.status][equals]=${encodeURIComponent(status)}` : LIST
