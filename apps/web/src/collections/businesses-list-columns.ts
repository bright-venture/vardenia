import type { UIField } from 'payload'

/**
 * List-only columns for the Magazine Places work on the Listings list
 * (PRD v4 section 7.1, Task 11a).
 *
 * `ui` fields: they store nothing (no column, no migration, nothing in
 * payload-types), render nothing on the edit form (Payload's UI field draws
 * null without a Field component), and cannot be sorted from the header
 * (presentational). Each draws its cell from the row; see
 * components/admin/SubmissionCells. Their labels are the column headings, which
 * is why these are not the nested `submission.*` fields themselves: those read
 * "submission > payment > stage".
 *
 * Sorting happens through the quick filters (lib/submission-queues), each of
 * which carries its own deadline sort.
 */

const CELLS = '/components/admin/SubmissionCells'

const column = (name: string, label: string, cell: string): UIField => ({
  name,
  label,
  type: 'ui',
  admin: { components: { Cell: `${CELLS}#${cell}` } },
})

export const LIST_COLUMNS: UIField[] = [
  column('listReference', 'Reference', 'ReferenceCell'),
  column('listIssuePage', 'Issue and page', 'IssuePageCell'),
  column('listStatus', 'Form status', 'StatusCell'),
  column('listStage', 'Payment', 'StageCell'),
  column('listMoney', 'Received / still to pay', 'MoneyCell'),
  column('listDeadline', 'Days left', 'DeadlineCell'),
  column('listSubmitted', 'Submitted', 'SubmittedCell'),
]

/** The default columns of the Listings list, in order. */
export const LIST_DEFAULT_COLUMNS = [
  'listReference',
  'name',
  'listIssuePage',
  'governorate',
  'category',
  'listStatus',
  'listStage',
  'listMoney',
  'listDeadline',
  'listSubmitted',
]
