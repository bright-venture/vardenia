'use client'

import { useState } from 'react'
import { useDocumentInfo, useFormFields } from '@payloadcms/ui'

/**
 * What staff do when someone cannot get into their account.
 *
 * The account screens were Payload's raw auth form: an email box, "Change
 * Password", "Force Unlock", a Verified tick. The one obvious tool was typing a
 * new password for somebody, which means staff knowing an owner's password and
 * the owner being handed one by phone. The site already sends reset links and
 * confirmation emails; this puts those in front of staff, with a line on when
 * each applies.
 *
 * Both buttons call the same endpoints the site's own forms do, so the email,
 * the rate limit and the link are exactly what the person would get by asking.
 * Nothing is sent without a second click.
 */

type Kind = 'reset' | 'verify'

const COPY: Record<Kind, { label: string; confirm: string; done: string }> = {
  reset: {
    label: 'Email a password reset link',
    confirm: 'Send a password reset link to',
    done: 'Sent. They choose a new password from the link in the email.',
  },
  verify: {
    label: 'Resend the confirmation email',
    confirm: 'Send a new confirmation link to',
    done: 'Sent. Once they open the link they can sign in and book.',
  },
}

export function AccountHelp() {
  const { collectionSlug } = useDocumentInfo()
  const f = useFormFields(([fields]) => ({
    email: String(fields.email?.value ?? '').trim(),
    verified: fields._verified?.value,
    deletedAt: fields.deletedAt?.value,
  }))
  const [asking, setAsking] = useState<Kind | null>(null)
  const [result, setResult] = useState<{ kind: Kind; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  if (!f.email) return null

  const guest = collectionSlug === 'customers'

  if (guest && f.deletedAt) {
    return (
      <section className="vd-review">
        <p className="vd-muted">
          This guest closed their account. Nothing can be sent to it, and it cannot be signed into
          again.
        </p>
      </section>
    )
  }

  const needsConfirming = guest && f.verified !== true

  async function send(kind: Kind) {
    setBusy(true)
    try {
      const response =
        kind === 'reset'
          ? await fetch(`/api/${collectionSlug}/forgot-password`, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email: f.email }),
            })
          : await fetch('/auth/verify/resend', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email: f.email }),
            })
      setResult({ kind, ok: response.ok })
    } catch {
      setResult({ kind, ok: false })
    } finally {
      setBusy(false)
      setAsking(null)
    }
  }

  const kinds: Kind[] = needsConfirming ? ['verify', 'reset'] : ['reset']

  return (
    <section className="vd-review">
      <h3 className="vd-help__title">Helping {guest ? 'a guest' : 'a venue owner'} get in</h3>
      <ul className="vd-help">
        {needsConfirming ? (
          <li>
            <strong>Never confirmed their email</strong>, so they cannot sign in yet. Resend the
            confirmation email.
          </li>
        ) : null}
        <li>
          <strong>Forgot the password:</strong> email them a reset link. Never set a password for
          someone; they choose their own.
        </li>
        <li>
          <strong>Too many wrong tries:</strong> the account locks for a while. Press Force Unlock
          above, then send a reset link if they still do not know it.
        </li>
        <li>
          <strong>New email address:</strong> change Email above and Save. They sign in with the new
          one from then on{guest ? ', and keep their bookings' : ''}.
        </li>
      </ul>

      <div className="vd-review__actions">
        {asking ? (
          <>
            <span>
              {COPY[asking].confirm} <strong>{f.email}</strong>?
            </span>
            <button
              type="button"
              className="vd-choice vd-choice--keep"
              disabled={busy}
              onClick={() => void send(asking)}
            >
              {busy ? 'Sending…' : 'Send'}
            </button>
            <button type="button" className="vd-link" onClick={() => setAsking(null)}>
              Cancel
            </button>
          </>
        ) : (
          kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              className="vd-choice"
              onClick={() => {
                setResult(null)
                setAsking(kind)
              }}
            >
              {COPY[kind].label}
            </button>
          ))
        )}
      </div>

      {result ? (
        <p className={result.ok ? 'vd-muted' : 'vd-warn'} role="status">
          {result.ok
            ? COPY[result.kind].done
            : 'It could not be sent. Try again in a few minutes; if it keeps failing, check the Errors report.'}
        </p>
      ) : null}
    </section>
  )
}

export default AccountHelp
