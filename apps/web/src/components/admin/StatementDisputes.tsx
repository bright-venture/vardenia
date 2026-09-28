'use client'

import { useField, useFormFields } from '@payloadcms/ui'

/**
 * The questioned lines of a fee statement, and the decision on each.
 *
 * A venue questions a line from its statement page, with a reason. Before this,
 * answering meant finding that line among the others, opening it, reading the
 * reason in a text box beside seven booking fields nobody needs at that moment,
 * and picking "upheld" or "rejected" from a dropdown whose words say nothing
 * about the money. Staff were asked to learn the vocabulary of the data model.
 *
 * So the questioned lines come first, each with what the venue wrote and two
 * buttons that say what happens: remove it from the bill, or keep it. A button
 * sets the line's outcome in the form like the dropdown did, and Save records
 * it, so the totals and the venue's page follow from the same save as before.
 */

type Outcome = 'none' | 'open' | 'upheld' | 'rejected'

interface Line {
  index: number
  reference: string
  day: string
  amount: number
  outcome: Outcome
  reason: string
  disputedAt: string
}

const money = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const date = (value: string, withYear = true) =>
  value
    ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        ...(withYear ? { year: 'numeric' as const } : {}),
        timeZone: 'UTC',
      })
    : ''

export function StatementDisputes() {
  // Every line's fields, flattened by Payload as `lines.0.amount` and so on.
  const { lines, vatRate } = useFormFields(([fields]) => {
    const rows = new Map<number, Line>()
    for (const [path, field] of Object.entries(fields)) {
      const match = path.match(/^lines\.(\d+)\.(\w+)$/)
      if (!match) continue
      const index = Number(match[1])
      const line = rows.get(index) ?? {
        index,
        reference: '',
        day: '',
        amount: 0,
        outcome: 'none' as Outcome,
        reason: '',
        disputedAt: '',
      }
      const value = field?.value
      switch (match[2]) {
        case 'reference':
          line.reference = String(value ?? '')
          break
        case 'day':
          line.day = String(value ?? '')
          break
        case 'amount':
          line.amount = Number(value) || 0
          break
        case 'disputeOutcome':
          line.outcome = ((value as Outcome) ?? 'none') || 'none'
          break
        case 'disputeReason':
          line.reason = String(value ?? '')
          break
        case 'disputedAt':
          line.disputedAt = String(value ?? '')
          break
      }
      rows.set(index, line)
    }
    return {
      lines: [...rows.values()].sort((a, b) => a.index - b.index),
      vatRate: Number(fields.vatRate?.value) || 0,
    }
  })

  const questioned = lines.filter((line) => line.outcome !== 'none')
  const waiting = questioned.filter((line) => line.outcome === 'open').length

  // What the total will be once saved, by the same rule as the server: only an
  // upheld line leaves the total. Shown so the effect of a click is visible.
  const subtotal = lines
    .filter((line) => line.outcome !== 'upheld')
    .reduce((sum, line) => sum + line.amount, 0)
  const total = Math.round((subtotal + (subtotal * vatRate) / 100) * 100) / 100

  if (questioned.length === 0) {
    return (
      <section style={styles.box}>
        <h3 style={styles.heading}>Questioned lines</h3>
        <p style={styles.muted}>
          The venue has not questioned any line on this statement. Nothing to answer.
        </p>
      </section>
    )
  }

  return (
    <section style={{ ...styles.box, ...(waiting > 0 ? styles.boxWaiting : {}) }}>
      <h3 style={styles.heading}>
        Questioned lines
        {waiting > 0 ? <span style={styles.badge}>{waiting} waiting for a decision</span> : null}
      </h3>
      <p style={styles.muted}>
        Check each one with the guest or the booking, then choose. Press <strong>Save</strong> at
        the top to record your decision: the total updates and the venue sees the answer on its
        statement.
      </p>

      <ol style={styles.list}>
        {questioned.map((line) => (
          <Dispute key={line.index} line={line} />
        ))}
      </ol>

      <p style={styles.total}>
        Total after saving: <strong>{money(total)}</strong>
        {vatRate > 0 ? <span style={styles.muted}> including {vatRate}% VAT</span> : null}
      </p>
    </section>
  )
}

function Dispute({ line }: { line: Line }) {
  const { setValue } = useField<Outcome>({ path: `lines.${line.index}.disputeOutcome` })

  const decided = line.outcome === 'upheld' || line.outcome === 'rejected'

  return (
    <li style={{ ...styles.item, ...(decided ? {} : styles.itemWaiting) }}>
      <div style={styles.itemHead}>
        <strong>
          {date(line.day)} · {line.reference || 'No reference'} · {money(line.amount)}
        </strong>
        <span style={styles.muted}>
          {line.disputedAt ? `Questioned on ${date(line.disputedAt)}` : 'Questioned'}
        </span>
      </div>

      <blockquote style={styles.reason}>
        <span style={styles.reasonLabel}>The venue wrote</span>
        {line.reason ? `"${line.reason}"` : 'No reason given.'}
      </blockquote>

      {decided ? (
        <div style={styles.decision}>
          <span>
            {line.outcome === 'upheld'
              ? `Removed from the bill. The venue does not pay ${money(line.amount)} for this booking.`
              : `Kept on the bill. The venue pays ${money(line.amount)} for this booking.`}
          </span>
          <button type="button" style={styles.link} onClick={() => setValue('open')}>
            Change decision
          </button>
        </div>
      ) : (
        <div style={styles.actions}>
          <button type="button" style={styles.button} onClick={() => setValue('upheld')}>
            Remove from the bill
          </button>
          <button type="button" style={styles.button} onClick={() => setValue('rejected')}>
            Keep on the bill
          </button>
          <span style={styles.muted}>
            Remove it if the venue is right, for example the guest never came.
          </span>
        </div>
      )}
    </li>
  )
}

const styles: Record<string, React.CSSProperties> = {
  box: {
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '8px',
    padding: 'var(--base)',
    marginBottom: 'calc(var(--base) * 1.5)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  boxWaiting: { borderColor: 'var(--theme-warning-500)', borderWidth: '2px' },
  heading: {
    margin: 0,
    fontSize: '1.15rem',
    display: 'flex',
    gap: '0.6rem',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  badge: {
    fontSize: '0.8rem',
    fontWeight: 600,
    padding: '0.15rem 0.55rem',
    borderRadius: '999px',
    background: 'var(--theme-warning-100)',
    color: 'var(--theme-warning-800)',
  },
  muted: { margin: 0, fontSize: '0.875rem', color: 'var(--theme-elevation-700)' },
  list: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  item: {
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '6px',
    padding: '0.9rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  itemWaiting: { background: 'var(--theme-elevation-50)' },
  itemHead: { display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' },
  reason: {
    margin: 0,
    padding: '0.5rem 0.8rem',
    borderLeft: '3px solid var(--theme-elevation-400)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  reasonLabel: {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--theme-elevation-700)',
  },
  actions: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' },
  button: {
    padding: '0.5rem 0.9rem',
    border: '1px solid var(--theme-elevation-800)',
    borderRadius: '4px',
    background: 'var(--theme-elevation-0)',
    color: 'var(--theme-elevation-900)',
    cursor: 'pointer',
    fontWeight: 600,
    minHeight: '2.25rem',
  },
  decision: { display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' },
  link: {
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'var(--theme-elevation-800)',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  total: { margin: 0, paddingTop: '0.25rem', borderTop: '1px solid var(--theme-elevation-100)' },
}

export default StatementDisputes
