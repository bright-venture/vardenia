'use client'

import { useState } from 'react'
import { useField, useFormFields } from '@payloadcms/ui'
import { DISPUTE_DAYS, PAYMENT_DAYS } from '@vardenia/core'
import { STATEMENT_MOVES } from '../../lib/statement-moves'

/**
 * The top of a fee statement: where it stands, what it comes to, and the one
 * or two things that can happen next.
 *
 * It was a column of grey boxes labelled "Vat", "Sent At" and "Dispute
 * Until", totals without a currency, and a status dropdown at the very bottom
 * offering all four statuses, most of which the server refuses. This reads the
 * same fields and says it in words: the total, the dates as dates, whether it
 * is overdue, and buttons only for the moves STATEMENT_MOVES allows from the
 * saved status. A button sets the status in the form; Save records it, so the
 * email to the venue and every guard run as they did from the dropdown.
 */

type Status = 'draft' | 'sent' | 'paid' | 'void'

const STATE: Record<Status, { text: string; className: string }> = {
  draft: { text: 'Draft: only the team can see it', className: 'vd-pill vd-pill--warn' },
  sent: { text: 'Sent to the venue', className: 'vd-pill' },
  paid: { text: 'Paid', className: 'vd-pill vd-pill--ok' },
  void: { text: 'Void', className: 'vd-pill vd-pill--off' },
}

const ACTION: Record<string, { label: string; tone: 'keep' | 'remove'; hint: string }> = {
  'draft>sent': {
    label: 'Send to the venue',
    tone: 'keep',
    hint: `The venue is emailed the statement, and the ${DISPUTE_DAYS} days to question a line and ${PAYMENT_DAYS} to pay start.`,
  },
  'draft>void': {
    label: 'Void',
    tone: 'remove',
    hint: 'The statement is cancelled for good, and the month can be drawn up again.',
  },
  'sent>paid': {
    label: 'Record payment',
    tone: 'keep',
    hint: 'Fill in how it was paid just below. Today is used as the payment date if you leave it empty.',
  },
  'sent>void': {
    label: 'Void',
    tone: 'remove',
    hint: 'The venue no longer owes this statement. Draw the month up again if it was wrong.',
  },
  'paid>sent': {
    label: 'Undo payment',
    tone: 'remove',
    hint: 'For a payment recorded by mistake. The statement is owed again.',
  },
}

const money = (value: unknown) =>
  `$${(Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const day = (value: unknown) => {
  const date = new Date(String(value ?? ''))
  return Number.isNaN(date.getTime()) || !value
    ? null
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function StatementSummary() {
  const f = useFormFields(([fields]) => ({
    number: String(fields.number?.value ?? ''),
    subtotal: fields.subtotal?.value,
    vat: fields.vat?.value,
    vatRate: Number(fields.vatRate?.value) || 0,
    total: fields.total?.value,
    sentAt: fields.sentAt?.value,
    disputeUntil: fields.disputeUntil?.value,
    dueAt: fields.dueAt?.value,
    paidAt: fields.paidAt?.value,
  }))
  const status = useField<Status>({ path: 'status' })
  // When the screen was opened, for "overdue". Read once: a clock read on
  // every render would make the render impure.
  const [openedAt] = useState(() => Date.now())

  // A statement is made from Booking fees, not here; a new one has nothing yet.
  if (!f.number) return null

  const saved = (status.initialValue ?? status.value ?? 'draft') as Status
  const chosen = (status.value ?? saved) as Status
  const changed = chosen !== saved
  const state = STATE[saved] ?? STATE.draft
  const moves = (STATEMENT_MOVES[saved] ?? []).filter((to) => ACTION[`${saved}>${to}`])
  const pending = changed ? ACTION[`${saved}>${chosen}`] : undefined
  const due = new Date(String(f.dueAt ?? '')).getTime()
  const overdue = saved === 'sent' && Number.isFinite(due) && due < openedAt

  const dates: [string, string | null][] = [
    ['Sent', day(f.sentAt)],
    ['Questions accepted until', day(f.disputeUntil)],
    ['Due', day(f.dueAt)],
    ['Paid', day(f.paidAt)],
  ]

  return (
    <section className="vd-review">
      <div className="vd-review__top">
        <span className="vd-booking__ref">{f.number}</span>
        <span className={overdue ? 'vd-pill vd-pill--bad' : state.className}>
          {overdue ? 'Overdue' : state.text}
        </span>
      </div>

      <div className="vd-summary__money">
        <span className="vd-summary__total">{money(f.total)}</span>
        <span className="vd-muted">
          {money(f.subtotal)} in fees
          {f.vatRate > 0 ? ` + ${money(f.vat)} VAT at ${f.vatRate}%` : ', no VAT'}
        </span>
      </div>

      <dl className="vd-booking__facts">
        {dates.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? <span className="vd-muted">Not yet</span>}</dd>
          </div>
        ))}
      </dl>

      <div className="vd-review__actions">
        {changed && pending ? (
          <>
            <span>
              <strong>{pending.label}:</strong> press Save to record it. {pending.hint}
            </span>
            <button type="button" className="vd-link" onClick={() => status.setValue(saved)}>
              Undo
            </button>
          </>
        ) : moves.length > 0 ? (
          moves.map((to) => {
            const action = ACTION[`${saved}>${to}`]!
            return (
              <button
                key={to}
                type="button"
                className={['vd-choice', `vd-choice--${action.tone}`].join(' ')}
                onClick={() => status.setValue(to as Status)}
              >
                {action.label}
              </button>
            )
          })
        ) : (
          <span className="vd-muted">
            Void. Nothing more happens to it; draw the month up again from Booking fees if needed.
          </span>
        )}
      </div>
    </section>
  )
}

export default StatementSummary
