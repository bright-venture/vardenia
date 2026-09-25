'use client'

import { useRowLabel } from '@payloadcms/ui'

/**
 * The title of each line on a fee statement, in place of "Line 03".
 *
 * A statement is read to find one booking - the one a venue questioned, the
 * table of fourteen - and "Line 03" says nothing about which that is. This says
 * the date, the booking reference, the fee, and whether it was questioned, so
 * the right line can be found without opening every one.
 */

interface Line {
  day?: string | null
  reference?: string | null
  amount?: number | null
  disputeOutcome?: 'none' | 'open' | 'upheld' | 'rejected' | null
}

const OUTCOME: Record<string, string> = {
  open: 'questioned, waiting for a decision',
  upheld: 'removed after checking',
  rejected: 'kept after checking',
}

export function StatementLineLabel() {
  const { data, rowNumber } = useRowLabel<Line>()

  const day = data?.day
    ? new Date(`${data.day}T12:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null
  const amount =
    typeof data?.amount === 'number'
      ? `$${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null
  const outcome = data?.disputeOutcome ? OUTCOME[data.disputeOutcome] : undefined

  const parts = [day, data?.reference, amount, outcome].filter(Boolean)
  return (
    <span>
      {parts.length > 0
        ? parts.join(' · ')
        : `Line ${String((rowNumber ?? 0) + 1).padStart(2, '0')}`}
    </span>
  )
}

export default StatementLineLabel
