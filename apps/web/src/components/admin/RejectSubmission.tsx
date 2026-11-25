'use client'

import { useState } from 'react'
import { useDocumentInfo, useFormFields } from '@payloadcms/ui'

/**
 * "Reject: not accepted" on a business that is waiting for review (or for the
 * downpayment, or still being filled in). Since Task 11b it is opened from the
 * "Payment and review" panel (PaymentReviewPanel), which passes what was
 * received so staff are told a refund will be due; it is no longer registered
 * on its own, so there is one Reject button. Staff write a reason (required) and may tick "share the reason"
 * to include it in the email to the owner. The server does the work and checks
 * the role and the state (POST /api/reject-submission); this only asks.
 *
 * Shown only while the saved status is in review, awaiting the downpayment or
 * incomplete, and the listing is
 * not published. Rejection is final, so the button asks for a second click.
 */

// Same states lib/place-payment-rules allows for "Reject: not accepted".
const REJECTABLE = ['pending', 'awaiting_downpayment', 'incomplete']

export function RejectSubmission({
  refundDue = null,
  onCancel,
}: {
  /** The money received and not yet returned ("$500"), when a downpayment was recorded. */
  refundDue?: string | null
  /** Closes the form (the panel's other buttons come back). */
  onCancel?: () => void
} = {}) {
  const { id } = useDocumentInfo()
  const status = useFormFields(([fields]) => fields?.['submission.status']?.value as unknown)
  const published = useFormFields(([fields]) => fields?._status?.value === 'published')
  const ownerName = useFormFields(
    ([fields]) => (fields?.['submission.ownerName']?.value as string | undefined) ?? '',
  )
  const [reason, setReason] = useState('')
  const [share, setShare] = useState(false)
  const [locale, setLocale] = useState<'auto' | 'en' | 'ar'>('auto')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (id === undefined || id === null) return null
  if (typeof status !== 'string' || !REJECTABLE.includes(status) || published) return null

  const send = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/reject-submission', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessId: id,
          reason,
          shareReason: share,
          ...(locale === 'auto' ? {} : { locale }),
        }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setMessage(body.error ?? 'The rejection did not go through.')
        setConfirming(false)
        return
      }
      window.location.reload()
    } catch {
      setMessage('The rejection did not go through. Check the connection and try again.')
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={styles.wrap} aria-label="Reject: not accepted">
      <h3 style={styles.title}>Reject: not accepted</h3>
      <p style={styles.hint}>
        Final. The page number is freed and {ownerName || 'the owner'} gets a short email. They can
        apply again from the Magazine Places page.
      </p>
      {refundDue ? (
        <p style={styles.refund}>
          A downpayment of {refundDue} was recorded, so a refund will be due: the business moves to
          Refunds to send, and the owner is emailed that the money will be returned by Whish.
        </p>
      ) : null}
      <label style={styles.field}>
        <span>Reason (required)</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={1000}
          style={styles.input}
        />
      </label>
      <label style={styles.check}>
        <input
          type="checkbox"
          checked={share}
          onChange={(event) => setShare(event.target.checked)}
        />
        <span>Share the reason with the owner in the email</span>
      </label>
      <label style={styles.field}>
        <span>Email language</span>
        <select
          value={locale}
          onChange={(event) => setLocale(event.target.value as 'auto' | 'en' | 'ar')}
          style={styles.input}
        >
          <option value="auto">Match the owner&apos;s name</option>
          <option value="en">English</option>
          <option value="ar">Arabic</option>
        </select>
      </label>
      {message ? (
        <p role="alert" style={styles.error}>
          {message}
        </p>
      ) : null}
      {confirming ? (
        <p style={styles.actions}>
          <button type="button" onClick={send} disabled={busy} style={styles.danger}>
            {busy ? 'Rejecting...' : 'Yes, reject it'}
          </button>
          <button type="button" onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </button>
        </p>
      ) : (
        <p style={styles.actions}>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!reason.trim()}
            style={styles.danger}
          >
            Reject: not accepted
          </button>
          {onCancel ? (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </p>
      )}
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    border: '1px solid var(--theme-error-300)',
    borderRadius: '8px',
    padding: 'var(--base)',
    margin: '0 0 var(--base)',
  },
  title: { margin: '0 0 0.25rem' },
  hint: { margin: '0 0 var(--base)', color: 'var(--theme-elevation-700)', fontSize: '0.9rem' },
  field: { display: 'grid', gap: '0.25rem', margin: '0 0 0.75rem' },
  input: { width: '100%' },
  check: { display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '0 0 0.75rem' },
  refund: { margin: '0 0 var(--base)', color: 'var(--theme-warning-700)', fontSize: '0.9rem' },
  error: { color: 'var(--theme-error-500)', margin: '0 0 0.75rem' },
  actions: { display: 'flex', gap: '0.5rem', margin: 0 },
  danger: { color: 'var(--theme-error-500)' },
}
