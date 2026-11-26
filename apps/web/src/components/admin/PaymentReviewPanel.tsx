'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth, useDocumentInfo, useFormModified } from '@payloadcms/ui'
import { HISTORY_STEPS } from '../../hooks/recordSubmissionHistory'
import { formatMoney } from '../../lib/place-payment-rules'
import {
  ACTION_LABELS,
  acceptBlocked,
  beirutDateTime,
  canUndo,
  checkAmount,
  daysLeftWords,
  emailNotice,
  expectedAmount,
  extendWhich,
  historyRows,
  isAdminRole,
  isStaffRole,
  layoutWords,
  moneyBody,
  moneyDefaults,
  moneyFacts,
  moneyFormError,
  moneyRows,
  panelActions,
  panelView,
  publishHint,
  refusalWords,
  resendEvent,
  stageWords,
  statusWords,
  type MoneyForm,
  type MoneyKind,
  type PanelAction,
  type PanelDoc,
  whishTimeMax,
} from '../../lib/payment-panel'
import { RejectSubmission } from './RejectSubmission'

/**
 * "Payment and review" on a business that came from the Magazine Places form
 * (Task 11b, PRD v4 page 5): where it is, the money, ONLY the buttons the
 * server would accept now (lib/payment-panel decides, from the same rules the
 * engine uses), the money list and the history.
 *
 * Staff only: the field sits in the staff-only Submission group, and this
 * renders nothing for anyone else. The business is read from the REST API
 * with the staff member's own session (draft=true, as the edit view shows the
 * newest version). Each form posts to its endpoint (submissions/
 * payment-endpoints, reject-endpoint), shows the server's refusal in its own
 * words, and reloads the page on success, so the form below never holds a
 * stale page number or status that a later Save could write back.
 *
 * Publishing stays Payload's normal Publish button; this only says whether it
 * will be accepted.
 */

const HISTORY_LABELS: Record<string, string> = Object.fromEntries(
  HISTORY_STEPS.map((s) => [s.value, s.label]),
)

async function post(path: string, body: Record<string, unknown>): Promise<string | null> {
  try {
    const response = await fetch(`/api${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (response.ok) return null
    return refusalWords(await response.json().catch(() => null), response.status)
  } catch {
    return 'It did not go through. Check the connection and try again.'
  }
}

/** Busy, error, and a send that reloads the page once the server said yes. */
function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const send = async (path: string, body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    const refused = await post(path, body)
    if (refused === null) {
      window.location.reload()
      return
    }
    setError(refused)
    setBusy(false)
  }
  return { busy, error, setError, send }
}

export function PaymentReviewPanel() {
  const { id } = useDocumentInfo()
  const { user } = useAuth()
  const modified = useFormModified()
  const [doc, setDoc] = useState<PanelDoc | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [open, setOpen] = useState<PanelAction | null>(null)
  const [undoing, setUndoing] = useState<string | null>(null)
  const staff = isStaffRole(user as never)

  useEffect(() => {
    if (id === undefined || id === null || !staff) return
    let cancelled = false
    fetch(`/api/businesses/${encodeURIComponent(String(id))}?depth=1&draft=true`, {
      credentials: 'same-origin',
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((body: PanelDoc) => {
        if (!cancelled) setDoc(body)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [id, staff])

  // Older rows have no downpayment amount copied: the engine then expects the
  // Settings percent of the price. Staff cannot read that group of Settings,
  // so it comes from the public terms route the owner form uses.
  const [percent, setPercent] = useState<number | null>(null)
  const needsPercent =
    doc !== null && typeof doc.submission?.payment?.downpaymentAmount !== 'number'
  useEffect(() => {
    if (!needsPercent) return
    let cancelled = false
    fetch('/place-submissions/terms', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { downpaymentPercent?: unknown } | null) => {
        const value = body?.downpaymentPercent
        if (!cancelled && typeof value === 'number' && Number.isFinite(value)) setPercent(value)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [needsPercent])

  const now = useMemo(() => new Date(), [])

  if (id === undefined || id === null || !staff) return null
  if (loadError) {
    return (
      <section style={styles.wrap} aria-label="Payment and review">
        <p role="alert" style={styles.error}>
          The payment details could not be loaded. Reload the page.
        </p>
      </section>
    )
  }
  if (!doc) {
    return (
      <section style={styles.wrap} aria-label="Payment and review">
        <p style={styles.muted}>Loading payment and review...</p>
      </section>
    )
  }
  if (!doc.submission?.status) return null

  const view = panelView(doc)
  const facts = moneyFacts(doc, now, percent)
  const actions = panelActions(view, user as never, doc)
  const money = (n: number) => formatMoney(n, facts.currency)
  const layout = layoutWords(doc)
  const hint = publishHint(doc)
  const notice = emailNotice(doc)
  const blocked = acceptBlocked(view)
  const rows = moneyRows(doc)
  const history = historyRows(doc, HISTORY_LABELS)
  const admin = isAdminRole(user as never)
  const close = () => setOpen(null)

  return (
    <section style={styles.wrap} aria-label="Payment and review">
      <h3 style={styles.title}>Payment and review</h3>
      <p style={styles.status}>
        <strong>{statusWords(doc)}</strong>
        <span style={styles.muted}> · Payment: {stageWords(view.stage)}</span>
      </p>

      <dl style={styles.facts}>
        {layout ? <Fact label="Layout" value={layout} /> : null}
        <Fact label="Price" value={facts.price > 0 ? money(facts.price) : 'Not on file'} />
        {facts.downpaymentExpected !== null ? (
          <Fact label="Downpayment expected" value={money(facts.downpaymentExpected)} />
        ) : null}
        <Fact label="Received" value={money(facts.received)} />
        <Fact label="Still to pay" value={money(facts.stillToPay)} />
        {facts.refunded > 0 || facts.toRefund > 0 ? (
          <Fact label="Refunded" value={money(facts.refunded)} />
        ) : null}
        {facts.toRefund > 0 ? <Fact label="To return" value={money(facts.toRefund)} /> : null}
        {facts.deadline ? (
          <Fact
            label={facts.deadline.label}
            value={`${beirutDateTime(facts.deadline.at, false)} (${daysLeftWords(facts.deadline.days)})`}
            alert={facts.deadline.days <= 3}
          />
        ) : null}
      </dl>

      {notice ? <p style={styles.notice}>{notice}</p> : null}
      {blocked ? <p style={styles.notice}>{blocked}</p> : null}
      {modified && actions.length > 0 ? (
        <p style={styles.notice}>
          You have unsaved changes on this page. Save them first: the page reloads after each action
          below.
        </p>
      ) : null}

      {open === null && actions.length > 0 ? (
        <p style={styles.buttons}>
          {actions.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setOpen(key)}
              style={key.startsWith('reject') ? styles.danger : undefined}
            >
              {key === 'extend' && view.status === 'lapsed'
                ? 'Extend deadline (re-open)'
                : ACTION_LABELS[key]}
              {key === 'waive' ? ' (admin)' : ''}
            </button>
          ))}
        </p>
      ) : null}

      {open === 'downpayment' || open === 'balance' || open === 'refund' ? (
        <MoneyAction kind={open} doc={doc} percent={percent} onCancel={close} />
      ) : null}
      {open === 'accept' ? (
        <ConfirmAction
          title="Accept"
          text={`Accepts the business. The owner is emailed to pay the rest (${money(facts.stillToPay)}) by Whish within the deadline.`}
          confirm="Yes, accept it"
          path="/accept-submission"
          body={{ businessId: doc.id }}
          onCancel={close}
        />
      ) : null}
      {open === 'resend' ? (
        <ConfirmAction
          title="Resend email"
          text={
            resendEvent(view) === 'E1'
              ? 'Sends the "pay the downpayment" email (E1) to the owner again.'
              : 'Sends the "pay the rest" email (E3) to the owner again.'
          }
          confirm="Yes, send it again"
          path="/resend-payment-email"
          body={{ businessId: doc.id, event: resendEvent(view) }}
          onCancel={close}
        />
      ) : null}
      {open === 'rejectNotAccepted' ? (
        <RejectSubmission
          refundDue={
            facts.received > facts.refunded ? money(facts.received - facts.refunded) : null
          }
          onCancel={close}
        />
      ) : null}
      {open === 'rejectUnpaid' ? (
        <ReasonAction
          title="Reject: did not pay the rest"
          text={`Final. The page number is released${facts.received > 0 ? `, the ${money(facts.received)} received is kept` : ''}, and the owner and the team are emailed.`}
          reasonLabel="Reason (optional)"
          reasonRequired={false}
          confirm="Yes, reject it"
          path="/reject-unpaid"
          body={{ businessId: doc.id }}
          danger
          onCancel={close}
        />
      ) : null}
      {open === 'waive' ? (
        <ReasonAction
          title="Waive downpayment (admin)"
          text="Moves the business to In review without a downpayment. Logged with your name."
          reasonLabel="Reason (required)"
          reasonRequired
          confirm="Yes, waive it"
          path="/waive-downpayment"
          body={{ businessId: doc.id }}
          danger
          onCancel={close}
        />
      ) : null}
      {open === 'extend' ? (
        <ExtendAction doc={doc} which={extendWhich(view)!} onCancel={close} />
      ) : null}

      {hint ? (
        <p style={view.status === 'paid' ? styles.ready : styles.muted}>Publish: {hint}</p>
      ) : null}

      <h4 style={styles.subtitle}>Money</h4>
      {rows.length === 0 ? (
        <p style={styles.muted}>Nothing received or refunded yet.</p>
      ) : (
        <div style={styles.scroll}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Amount</th>
                <th style={styles.th}>Sender</th>
                <th style={styles.th}>Whish time</th>
                <th style={styles.th}>Recorded by</th>
                <th style={styles.th}>Note</th>
                {admin ? <th style={styles.th} /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={row.voided ? styles.voided : undefined}>
                  <td style={styles.td}>
                    {row.type}
                    {row.mark ? <div style={styles.mark}>{row.mark}</div> : null}
                  </td>
                  <td style={styles.td}>{row.voided ? <s>{row.amount}</s> : row.amount}</td>
                  <td style={styles.td}>{row.sender || row.method}</td>
                  <td style={styles.td}>{row.whishAt}</td>
                  <td style={styles.td}>{row.recorded}</td>
                  <td style={styles.td}>{row.note}</td>
                  {admin ? (
                    <td style={styles.td}>
                      {canUndo(view, row.id, user as never) && undoing === null && open === null ? (
                        <button type="button" onClick={() => setUndoing(row.id)}>
                          Undo
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {undoing ? (
        <ReasonAction
          title="Undo this money entry (admin)"
          text={`Marks the ${rows.find((r) => r.id === undoing)?.type.toLowerCase() ?? 'line'} of ${rows.find((r) => r.id === undoing)?.amount ?? ''} as undone. It stays in the list, marked undone, and the status steps back if it needs to. Logged with your name.`}
          reasonLabel="Reason (required)"
          reasonRequired
          confirm="Yes, undo it"
          path="/undo-money-entry"
          body={{ businessId: doc.id, entryId: undoing }}
          danger
          onCancel={() => setUndoing(null)}
        />
      ) : null}

      <h4 style={styles.subtitle}>History</h4>
      {history.length === 0 ? (
        <p style={styles.muted}>No steps yet.</p>
      ) : (
        <ol style={styles.history}>
          {history.map((h) => (
            <li key={h.key} style={styles.historyLine}>
              <span style={styles.muted}>{h.at}</span> <strong>{h.label}</strong>
              {h.by ? <span style={styles.muted}> by {h.by}</span> : null}
              {h.note ? <div>{h.note}</div> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Fact({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div style={styles.fact}>
      <dt style={styles.factLabel}>{label}</dt>
      <dd style={alert ? { ...styles.factValue, ...styles.alert } : styles.factValue}>{value}</dd>
    </div>
  )
}

const MONEY_PATHS: Record<MoneyKind, string> = {
  downpayment: '/downpayment-received',
  balance: '/balance-received',
  refund: '/refund-sent',
}

const MONEY_TITLES: Record<MoneyKind, string> = {
  downpayment: 'Downpayment received',
  balance: 'Balance received',
  refund: 'Refund sent',
}

function MoneyAction({
  kind,
  doc,
  percent,
  onCancel,
}: {
  kind: MoneyKind
  doc: PanelDoc
  /** Settings downpayment percent, for rows with no copied amount (null: unknown). */
  percent: number | null
  onCancel: () => void
}) {
  const [form, setForm] = useState<MoneyForm>(() => moneyDefaults(kind, doc, percent))
  const { busy, error, send } = useAction()
  const facts = moneyFacts(doc, new Date(), percent)
  const check = checkAmount(kind, form.amount, expectedAmount(kind, doc, percent), facts.currency)
  const missing = moneyFormError(kind, form, check)
  const set = (patch: Partial<MoneyForm>) => setForm((f) => ({ ...f, ...patch }))
  const whish = form.method === 'whish'

  return (
    <form
      style={styles.form}
      aria-label={MONEY_TITLES[kind]}
      onSubmit={(event) => {
        event.preventDefault()
        if (!missing && !busy) void send(MONEY_PATHS[kind], moneyBody(doc.id, form))
      }}
    >
      <h4 style={styles.formTitle}>{MONEY_TITLES[kind]}</h4>
      <label style={styles.field}>
        <span>Amount ({facts.currency})</span>
        <input
          name="amount"
          inputMode="decimal"
          value={form.amount}
          onChange={(e) => set({ amount: e.target.value })}
          style={styles.input}
        />
      </label>
      {check.warning ? <p style={styles.warning}>{check.warning}</p> : null}
      <label style={styles.field}>
        <span>How it was {kind === 'refund' ? 'sent' : 'paid'}</span>
        <select
          name="method"
          value={form.method}
          onChange={(e) => set({ method: e.target.value as MoneyForm['method'] })}
          style={styles.input}
        >
          <option value="whish">Whish</option>
          <option value="desk">At the desk</option>
          <option value="cash">Cash</option>
        </select>
      </label>
      <label style={styles.field}>
        <span>
          {kind === 'refund' ? 'Sent to number' : 'Sender number'}
          {whish && kind !== 'refund' ? '' : ' (optional)'}
        </span>
        <input
          name="senderNumber"
          value={form.senderNumber}
          onChange={(e) => set({ senderNumber: e.target.value })}
          style={styles.input}
        />
      </label>
      {whish ? (
        <label style={styles.field}>
          <span>Whish date and time (Lebanon time, as shown in Whish)</span>
          <input
            name="whishAt"
            type="datetime-local"
            value={form.whishAt}
            max={whishTimeMax(new Date())}
            onChange={(e) => set({ whishAt: e.target.value })}
            style={styles.input}
          />
        </label>
      ) : null}
      <label style={styles.field}>
        <span>Note{check.noteRequired ? ' (required: the amount differs)' : ' (optional)'}</span>
        <textarea
          name="note"
          rows={2}
          maxLength={1000}
          value={form.note}
          onChange={(e) => set({ note: e.target.value })}
          style={styles.input}
        />
      </label>
      {error ? (
        <p role="alert" style={styles.error}>
          {error}
        </p>
      ) : missing && form.amount ? (
        <p style={styles.muted}>{missing}</p>
      ) : null}
      <p style={styles.buttons}>
        <button type="submit" disabled={busy || missing !== null}>
          {busy ? 'Saving...' : `Record: ${MONEY_TITLES[kind].toLowerCase()}`}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </p>
    </form>
  )
}

function ConfirmAction({
  title,
  text,
  confirm,
  path,
  body,
  onCancel,
}: {
  title: string
  text: string
  confirm: string
  path: string
  body: Record<string, unknown>
  onCancel: () => void
}) {
  const { busy, error, send } = useAction()
  return (
    <div style={styles.form} role="group" aria-label={title}>
      <h4 style={styles.formTitle}>{title}</h4>
      <p style={styles.hint}>{text}</p>
      {error ? (
        <p role="alert" style={styles.error}>
          {error}
        </p>
      ) : null}
      <p style={styles.buttons}>
        <button type="button" onClick={() => void send(path, body)} disabled={busy}>
          {busy ? 'Sending...' : confirm}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </p>
    </div>
  )
}

/** A reason, then a second click (reject did-not-pay, waive, undo). */
function ReasonAction({
  title,
  text,
  reasonLabel,
  reasonRequired,
  confirm,
  path,
  body,
  danger,
  onCancel,
}: {
  title: string
  text: string
  reasonLabel: string
  reasonRequired: boolean
  confirm: string
  path: string
  body: Record<string, unknown>
  danger?: boolean
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const { busy, error, send } = useAction()
  const ready = !reasonRequired || reason.trim().length > 0
  return (
    <div style={styles.form} role="group" aria-label={title}>
      <h4 style={styles.formTitle}>{title}</h4>
      <p style={styles.hint}>{text}</p>
      <label style={styles.field}>
        <span>{reasonLabel}</span>
        <textarea
          name="reason"
          rows={2}
          maxLength={1000}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value)
            setConfirming(false)
          }}
          style={styles.input}
        />
      </label>
      {error ? (
        <p role="alert" style={styles.error}>
          {error}
        </p>
      ) : null}
      <p style={styles.buttons}>
        {confirming ? (
          <button
            type="button"
            onClick={() =>
              void send(path, reason.trim() ? { ...body, reason: reason.trim() } : body)
            }
            disabled={busy}
            style={danger ? styles.danger : undefined}
          >
            {busy ? 'Sending...' : confirm}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!ready}
            style={danger ? styles.danger : undefined}
          >
            {title}
          </button>
        )}
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </p>
    </div>
  )
}

function ExtendAction({
  doc,
  which,
  onCancel,
}: {
  doc: PanelDoc
  which: 'downpayment' | 'balance'
  onCancel: () => void
}) {
  const [days, setDays] = useState('7')
  const [reason, setReason] = useState('')
  const { busy, error, send } = useAction()
  const lapsed = doc.submission?.status === 'lapsed'
  const n = Number(days)
  const daysOk = Number.isInteger(n) && n >= 1 && n <= 90
  const due =
    which === 'balance'
      ? doc.submission?.payment?.balanceDueAt
      : doc.submission?.payment?.downpaymentDueAt
  return (
    <form
      style={styles.form}
      aria-label="Extend deadline"
      onSubmit={(event) => {
        event.preventDefault()
        if (daysOk && reason.trim() && !busy) {
          void send('/extend-deadline', {
            businessId: doc.id,
            which,
            days: n,
            reason: reason.trim(),
          })
        }
      }}
    >
      <h4 style={styles.formTitle}>{lapsed ? 'Extend deadline (re-open)' : 'Extend deadline'}</h4>
      <p style={styles.hint}>
        {which === 'balance' ? 'Deadline for the rest' : 'Deadline for the downpayment'}
        {due && !lapsed ? `, now ${beirutDateTime(due, false)}` : ''}.{' '}
        {lapsed
          ? 'Re-opens the business with its old page number, if no one took it since. The owner is sent the "pay the downpayment" email again automatically.'
          : 'Counted from the current deadline, or from today if it has passed.'}
      </p>
      <label style={styles.field}>
        <span>Days (1 to 90)</span>
        <input
          name="days"
          type="number"
          min={1}
          max={90}
          step={1}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          style={styles.input}
        />
      </label>
      <label style={styles.field}>
        <span>Reason (required)</span>
        <textarea
          name="reason"
          rows={2}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={styles.input}
        />
      </label>
      {error ? (
        <p role="alert" style={styles.error}>
          {error}
        </p>
      ) : null}
      <p style={styles.buttons}>
        <button type="submit" disabled={busy || !daysOk || !reason.trim()}>
          {busy ? 'Saving...' : lapsed ? 'Re-open' : 'Extend'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </p>
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '8px',
    padding: 'var(--base)',
    margin: '0 0 var(--base)',
    background: 'var(--theme-elevation-0)',
  },
  title: { margin: '0 0 0.25rem' },
  subtitle: { margin: 'var(--base) 0 0.5rem' },
  status: { margin: '0 0 0.75rem' },
  muted: { color: 'var(--theme-elevation-700)', fontSize: '0.9rem', margin: '0 0 0.5rem' },
  hint: { margin: '0 0 0.75rem', color: 'var(--theme-elevation-700)', fontSize: '0.9rem' },
  facts: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem 1.5rem',
    margin: '0 0 0.75rem',
  },
  fact: { display: 'grid', gap: '0.1rem' },
  factLabel: { color: 'var(--theme-elevation-700)', fontSize: '0.8rem' },
  factValue: { margin: 0, fontWeight: 600 },
  alert: { color: 'var(--theme-error-500)' },
  notice: { margin: '0 0 0.75rem', color: 'var(--theme-warning-700)', fontSize: '0.9rem' },
  warning: { margin: '0 0 0.75rem', color: 'var(--theme-warning-700)', fontSize: '0.85rem' },
  ready: { margin: '0.5rem 0', color: 'var(--theme-success-700)', fontWeight: 600 },
  buttons: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0 0 0.5rem' },
  danger: { color: 'var(--theme-error-500)' },
  error: { color: 'var(--theme-error-500)', margin: '0 0 0.75rem' },
  form: {
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '6px',
    padding: 'var(--base)',
    margin: '0 0 var(--base)',
  },
  formTitle: { margin: '0 0 0.5rem' },
  field: { display: 'grid', gap: '0.25rem', margin: '0 0 0.75rem' },
  input: { width: '100%' },
  scroll: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: {
    textAlign: 'left',
    padding: '0.35rem 0.5rem',
    borderBottom: '1px solid var(--theme-elevation-150)',
    color: 'var(--theme-elevation-700)',
    fontWeight: 500,
  },
  td: {
    padding: '0.35rem 0.5rem',
    borderBottom: '1px solid var(--theme-elevation-100)',
    verticalAlign: 'top',
  },
  voided: { color: 'var(--theme-elevation-500)' },
  mark: { fontSize: '0.8rem', color: 'var(--theme-elevation-700)' },
  history: { margin: 0, paddingLeft: '1.25rem', display: 'grid', gap: '0.35rem' },
  historyLine: { fontSize: '0.9rem' },
}
