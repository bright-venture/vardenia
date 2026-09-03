'use client'

import { useState } from 'react'
import { useRouter } from '../i18n/routing'
import { ERROR_TEXT, INPUT, LABEL, NOTICE_SUCCESS, PRIMARY_BUTTON } from './formStyles'

/**
 * The three things a customer can change about their own account.
 *
 * # Disclosures rather than three open forms
 *
 * An account page whose first screen is nine input fields reads as a settings
 * panel for something complicated. Almost nobody arrives here to change their
 * password; they arrive to look at a booking. So each change is a `<details>`
 * that opens on demand, and the page's resting state is a short list of what is
 * currently true.
 *
 * `<details>` rather than React state because it needs no JavaScript to open,
 * and because a native disclosure is already keyboard operable and announced
 * correctly. The forms inside need JavaScript, which is a smaller promise than
 * the page needing it to be readable.
 *
 * # Why the current password is asked for twice over
 *
 * Changing an email or a password is an account takeover if it is wrong, and a
 * session cookie only proves somebody has the browser - not that they know the
 * secret. A borrowed laptop is the ordinary case this defends against, not a
 * contrived one. The server enforces it; this asks for it because a form that
 * omits a required field and then reports a 403 is a worse experience than one
 * that asks.
 *
 * # Errors are per field
 *
 * The route answers with `{ errors: { currentPassword: '...' } }`, so a wrong
 * password says so under the password box rather than as a banner at the top
 * that leaves the reader hunting for which of six fields it meant.
 */

type Errors = Record<string, string>

function useAction() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [done, setDone] = useState<string | null>(null)

  const submit = async (body: Record<string, unknown>, onSuccess?: () => void) => {
    setBusy(true)
    setErrors({})
    setDone(null)

    try {
      const response = await fetch('/auth/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
        errors?: Errors
      }

      if (response.ok && payload.ok) {
        setDone(payload.message ?? 'Saved.')
        onSuccess?.()
        // The page is a server component reading the session, so the new name
        // or address only appears after the server renders again.
        router.refresh()
        return
      }

      setErrors(payload.errors ?? { form: payload.message ?? 'That did not work.' })
    } catch {
      setErrors({ form: 'Something went wrong. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return { busy, errors, done, submit }
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  // `role="alert"` so it is announced when it appears rather than only found
  // by somebody who happens to move back through the form.
  return (
    <p role="alert" className={ERROR_TEXT}>
      {message}
    </p>
  )
}

function Panel({
  summary,
  hint,
  children,
}: {
  summary: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <details className="border-ink-100 group border-b py-4">
      <summary className="text-ink-900 flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
        <span>
          {summary}
          {hint ? <span className="text-ink-500 ms-2 font-normal">{hint}</span> : null}
        </span>
        <span
          aria-hidden
          className="text-ink-500 transition-transform duration-200 group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="mt-4 max-w-sm">{children}</div>
    </details>
  )
}

export function ChangeName({ current }: { current: string }) {
  const { busy, errors, done, submit } = useAction()
  const [name, setName] = useState(current)

  return (
    <Panel summary="Name" hint={current}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit({ action: 'name', name })
        }}
      >
        <label className={LABEL} htmlFor="profile-name">
          Your name
        </label>
        <input
          id="profile-name"
          className={INPUT}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          required
        />
        <FieldError message={errors.name} />
        <FieldError message={errors.form} />

        {done ? <p className={`${NOTICE_SUCCESS} mt-3`}>{done}</p> : null}

        <button className={`${PRIMARY_BUTTON} mt-4`} disabled={busy || name === current}>
          {busy ? 'Saving...' : 'Save name'}
        </button>
      </form>
    </Panel>
  )
}

export function ChangeEmail({ current }: { current: string }) {
  const { busy, errors, done, submit } = useAction()
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')

  return (
    <Panel summary="Email address" hint={current}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit({ action: 'email', email, currentPassword }, () => {
            setEmail('')
            setCurrentPassword('')
          })
        }}
      >
        <label className={LABEL} htmlFor="profile-email">
          New email address
        </label>
        <input
          id="profile-email"
          type="email"
          className={INPUT}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
        <FieldError message={errors.email} />

        <label className={`${LABEL} mt-4`} htmlFor="profile-email-password">
          Your current password
        </label>
        <input
          id="profile-email-password"
          type="password"
          className={INPUT}
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        <FieldError message={errors.currentPassword} />
        <FieldError message={errors.form} />

        {/* Said before they submit, not after. Changing the address signs the
            account out of nothing but does make it unverified until the link is
            followed, and finding that out afterwards is a surprise. */}
        <p className="text-ink-500 mt-3 text-xs leading-relaxed">
          We will send a link to the new address to confirm it, and tell your old address that it
          changed.
        </p>

        {done ? <p className={`${NOTICE_SUCCESS} mt-3`}>{done}</p> : null}

        <button className={`${PRIMARY_BUTTON} mt-4`} disabled={busy}>
          {busy ? 'Saving...' : 'Change email'}
        </button>
      </form>
    </Panel>
  )
}

export function ChangePassword() {
  const { busy, errors, done, submit } = useAction()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')

  return (
    <Panel summary="Password">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit({ action: 'password', password, currentPassword }, () => {
            setCurrentPassword('')
            setPassword('')
          })
        }}
      >
        <label className={LABEL} htmlFor="profile-current-password">
          Current password
        </label>
        <input
          id="profile-current-password"
          type="password"
          className={INPUT}
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        <FieldError message={errors.currentPassword} />

        <label className={`${LABEL} mt-4`} htmlFor="profile-new-password">
          New password
        </label>
        <input
          id="profile-new-password"
          type="password"
          className={INPUT}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={10}
          required
        />
        <FieldError message={errors.password} />
        <FieldError message={errors.form} />

        <p className="text-ink-500 mt-2 text-xs">At least 10 characters.</p>

        {done ? <p className={`${NOTICE_SUCCESS} mt-3`}>{done}</p> : null}

        <button className={`${PRIMARY_BUTTON} mt-4`} disabled={busy}>
          {busy ? 'Saving...' : 'Change password'}
        </button>
      </form>
    </Panel>
  )
}
