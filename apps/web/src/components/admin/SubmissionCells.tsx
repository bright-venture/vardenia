import { cache } from 'react'
import type { DefaultServerCellComponentProps, Payload } from 'payload'
import { formatMoney } from '../../lib/place-payment-rules'
import {
  STAGE_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  deadlineText,
  nextDeadline,
  type SubmissionRow,
  type Tone,
} from '../../lib/submission-queues'

/**
 * The Magazine Places columns of the Listings list (Task 11a): reference,
 * issue and page, status, payment stage, money, deadline, submitted.
 *
 * Server components: Payload renders list cells on the server and hands them
 * the whole row (`rowData`, depth 0), so each cell reads what it needs from
 * the row and nothing is fetched per row. The one lookup, the issue titles, is
 * one query per page render (React `cache`), not one per row.
 *
 * Styles are the admin's existing pills (app/(payload)/custom.css).
 */

type Props = DefaultServerCellComponentProps

interface Row {
  issue?: number | string | { id?: number | string; title?: string | null } | null
  listingNumber?: number | null
  submission?:
    | (SubmissionRow & {
        reference?: string | null
        submittedAt?: string | null
        payment?: SubmissionRow['payment'] & {
          currency?: string | null
          price?: number | null
          received?: number | null
          refunded?: number | null
          stillToPay?: number | null
        }
      })
    | null
}

const PILL: Record<Tone, string> = {
  ok: 'vd-pill vd-pill--ok',
  warn: 'vd-pill vd-pill--warn',
  bad: 'vd-pill vd-pill--bad',
  off: 'vd-pill vd-pill--off',
  plain: 'vd-pill',
}

const muted: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  color: 'var(--theme-elevation-600)',
}

const shortDate = (at: Date) =>
  at.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Beirut',
  })

/** Every issue's title, once per render. Titles only; nothing private. */
const issueTitles = cache(async (payload: Payload): Promise<Map<string, string>> => {
  const result = await payload.find({
    collection: 'issues',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { title: true },
  })
  return new Map(
    (result.docs as { id: number | string; title?: string | null }[]).map((doc) => [
      String(doc.id),
      doc.title ?? `Issue ${doc.id}`,
    ]),
  )
})

const row = (props: Props) => (props.rowData ?? {}) as Row

/** VD-123. */
export function ReferenceCell(props: Props) {
  const reference = row(props).submission?.reference
  return reference ? <span className="vd-num">{reference}</span> : null
}

/** "Winter 2026", "Page 12". */
export async function IssuePageCell(props: Props) {
  const { issue, listingNumber } = row(props)
  const id = issue && typeof issue === 'object' ? issue.id : issue
  if (!id && !listingNumber) return null
  let title: string | null = null
  if (issue && typeof issue === 'object' && issue.title) title = issue.title
  else if (id) title = (await issueTitles(props.payload)).get(String(id)) ?? `Issue ${id}`
  return (
    <span>
      {title}
      {listingNumber ? <span style={muted}>Page {listingNumber}</span> : null}
    </span>
  )
}

export function StatusCell(props: Props) {
  const submission = row(props).submission
  const status = submission?.status
  if (!status) return null
  const kind =
    status === 'rejected' && submission?.rejectionKind === 'unpaid'
      ? 'did not pay the rest'
      : status === 'rejected' && submission?.rejectionKind === 'not_accepted'
        ? 'not accepted'
        : null
  return (
    <span>
      <span className={PILL[STATUS_TONE[status] ?? 'plain']}>
        {STATUS_LABELS[status] ?? status}
      </span>
      {kind ? <span style={muted}>{kind}</span> : null}
    </span>
  )
}

export function StageCell(props: Props) {
  const stage = row(props).submission?.payment?.stage
  if (!stage || !row(props).submission?.status) return null
  const tone: Tone =
    stage === 'refund_due'
      ? 'bad'
      : stage === 'fully_paid'
        ? 'ok'
        : stage === 'none'
          ? 'off'
          : 'plain'
  return <span className={PILL[tone]}>{STAGE_LABELS[stage] ?? stage}</span>
}

/** "$500 received", then "$500 still to pay" or "$500 to refund". */
export function MoneyCell(props: Props) {
  const submission = row(props).submission
  const payment = submission?.payment
  if (!submission?.status || !payment) return null
  const currency = payment.currency || 'USD'
  const received = Number(payment.received ?? 0)
  const refunded = Number(payment.refunded ?? 0)
  const stillToPay = Number(payment.stillToPay ?? 0)
  const owesUs = ['awaiting_downpayment', 'pending', 'accepted'].includes(submission.status)
  const second =
    payment.stage === 'refund_due'
      ? `${formatMoney(Math.max(0, received - refunded), currency)} to refund`
      : owesUs && stillToPay > 0
        ? `${formatMoney(stillToPay, currency)} still to pay`
        : null
  if (!received && !second) return null
  return (
    <span className="vd-num">
      {formatMoney(received, currency)} received
      {second ? <span style={muted}>{second}</span> : null}
    </span>
  )
}

/** Days left to the deadline that is running, overdue in red. */
export function DeadlineCell(props: Props) {
  const deadline = nextDeadline(row(props).submission)
  if (!deadline) return null
  const { text, tone } = deadlineText(deadline.at, new Date())
  return (
    <span>
      <span className={PILL[tone]}>{text}</span>
      <span style={muted}>
        {deadline.which === 'balance' ? 'The rest' : 'Downpayment'}, {shortDate(deadline.at)}
      </span>
    </span>
  )
}

export function SubmittedCell(props: Props) {
  const raw = row(props).submission?.submittedAt
  if (!raw) return null
  const at = new Date(raw)
  return Number.isNaN(at.getTime()) ? null : <span>{shortDate(at)}</span>
}
