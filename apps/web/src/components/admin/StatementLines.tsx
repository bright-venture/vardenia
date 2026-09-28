'use client'

import Link from 'next/link'
import { useFormFields } from '@payloadcms/ui'

/**
 * A fee statement's lines, as a table to read rather than a form to fill in.
 *
 * Each line is copied from a completed booking when the statement is drawn up.
 * Payload's array field showed every line as a card of editable inputs, booking
 * picker included, so staff could quietly point a line at a different booking
 * while its reference still named the first one - and were left wondering why
 * they were being asked to. Nothing about a line is a staff decision except
 * the dispute, and that is answered in the box above (StatementDisputes).
 *
 * This replaces the array's input only. The form state underneath is Payload's,
 * built from the schema, so the lines are still saved with the statement and
 * the dispute buttons still set each line's outcome.
 */

type Outcome = 'none' | 'open' | 'upheld' | 'rejected'

interface Row {
  index: number
  booking: string | number | null
  reference: string
  day: string
  unit: string
  quantity: number
  rate: number
  amount: number
  outcome: Outcome
}

const UNITS: Record<string, [string, string]> = {
  guest: ['guest', 'guests'],
  night: ['night', 'nights'],
  booking: ['booking', 'bookings'],
}

const money = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const date = (value: string) =>
  value
    ? new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : ''

const STATUS: Record<Outcome, { text: string; className: string }> = {
  none: { text: 'Counted', className: '' },
  open: { text: 'Questioned: decide above', className: 'vd-pill vd-pill--warn' },
  upheld: { text: 'Removed from the bill', className: 'vd-pill vd-pill--off' },
  rejected: { text: 'Kept after checking', className: 'vd-pill' },
}

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

export function StatementLines({ path = 'lines' }: { path?: string }) {
  const rows = useFormFields(([fields]) => {
    const byIndex = new Map<number, Row>()
    const pattern = new RegExp(`^${path.replace(/\./g, '\\.')}\\.(\\d+)\\.(\\w+)$`)

    for (const [key, field] of Object.entries(fields)) {
      const match = key.match(pattern)
      if (!match) continue
      const index = Number(match[1])
      const row = byIndex.get(index) ?? {
        index,
        booking: null,
        reference: '',
        day: '',
        unit: '',
        quantity: 0,
        rate: 0,
        amount: 0,
        outcome: 'none' as Outcome,
      }
      const value = field?.value
      switch (match[2]) {
        case 'booking':
          row.booking = idOf(value)
          break
        case 'reference':
          row.reference = String(value ?? '')
          break
        case 'day':
          row.day = String(value ?? '')
          break
        case 'unit':
          row.unit = String(value ?? '')
          break
        case 'quantity':
          row.quantity = Number(value) || 0
          break
        case 'rate':
          row.rate = Number(value) || 0
          break
        case 'amount':
          row.amount = Number(value) || 0
          break
        case 'disputeOutcome':
          row.outcome = ((value as Outcome) || 'none') as Outcome
          break
      }
      byIndex.set(index, row)
    }
    return [...byIndex.values()].sort((a, b) => a.day.localeCompare(b.day) || a.index - b.index)
  })

  const counted = rows.filter((row) => row.outcome !== 'upheld')
  const subtotal = counted.reduce((sum, row) => sum + row.amount, 0)

  return (
    <section className="vd-lines">
      <header className="vd-lines__head">
        <h3>Bookings on this statement</h3>
        <p>
          Copied from completed bookings when the statement was drawn up, so they cannot be edited
          here. If one is wrong, correct the booking, set this statement to Void and draw the month
          up again from Booking fees.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="vd-lines__empty">No bookings on this statement.</p>
      ) : (
        <div className="vd-lines__scroll">
          <table className="vd-lines__table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Booking</th>
                <th>Charged for</th>
                <th className="vd-num">Rate</th>
                <th className="vd-num">Fee</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const [one, many] = UNITS[row.unit] ?? [row.unit, row.unit]
                const status = STATUS[row.outcome] ?? STATUS.none
                return (
                  <tr key={row.index} className={row.outcome === 'upheld' ? 'is-removed' : ''}>
                    <td>{date(row.day)}</td>
                    <td>
                      {row.booking !== null ? (
                        <Link href={`/admin/collections/bookings/${row.booking}`}>
                          {row.reference || `Booking ${row.booking}`}
                        </Link>
                      ) : (
                        row.reference || 'No booking'
                      )}
                    </td>
                    <td>
                      {row.quantity} {row.quantity === 1 ? one : many}
                    </td>
                    <td className="vd-num">{money(row.rate)}</td>
                    <td className="vd-num vd-fee">{money(row.amount)}</td>
                    <td>
                      {status.className ? (
                        <span className={status.className}>{status.text}</span>
                      ) : (
                        <span className="vd-muted">{status.text}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>
                  {counted.length} of {rows.length} {rows.length === 1 ? 'booking' : 'bookings'}{' '}
                  counted
                </td>
                <td className="vd-num vd-fee">{money(subtotal)}</td>
                <td className="vd-muted">before VAT</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}

export default StatementLines
