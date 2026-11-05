'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
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
  const common = useTranslations('common')
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
        setDone(payload.message ?? common('saved'))
        onSuccess?.()
        // The page is a server component reading the session, so the new name
        // or address only appears after the server renders again.
        router.refresh()
        return
      }

      setErrors(payload.errors ?? { form: payload.message ?? common('error') })
    } catch {
      setErrors({ form: common('error') })
    } finally {
      setBusy(false)
    }
  }

  return { busy, errors, done, submit }
}

function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null
  // `role="alert"` so it is announced when it appears rather than only found
  // by somebody who happens to move back through the form.
  return (
    <p id={id} role="alert" className={ERROR_TEXT}>
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
      <summary className="text-ink-900 focus-visible:outline-gold-500 flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
        <span className="grid min-w-0 gap-1.5 break-words">
          <span>{summary}</span>
          {hint ? (
            <span className="text-ink-500 break-all font-normal">
              <bdi dir="auto">{hint}</bdi>
            </span>
          ) : null}
        </span>
        <span
          aria-hidden
          className="text-ink-500 shrink-0 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
        >
          +
        </span>
      </summary>
      <div className="mt-4 max-w-sm">{children}</div>
    </details>
  )
}

export function ChangeName({ current }: { current: string }) {
  const t = useTranslations('account')
  const common = useTranslations('common')
  const { busy, errors, done, submit } = useAction()
  const [name, setName] = useState(current)

  return (
    <Panel summary={t('name')} hint={current}>
      <form
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault()
          void submit({ action: 'name', name })
        }}
      >
        <label className={LABEL} htmlFor="profile-name">
          {t('name')}
        </label>
        <input
          id="profile-name"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'profile-name-error' : undefined}
          className={INPUT}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          required
        />
        <FieldError id="profile-name-error" message={errors.name} />
        <FieldError message={errors.form} />

        {done ? (
          <p role="status" className={`${NOTICE_SUCCESS} mt-3`}>
            {done}
          </p>
        ) : null}

        <button className={`${PRIMARY_BUTTON} mt-4`} disabled={busy || name === current}>
          {busy ? t('working') : common('save')}
        </button>
      </form>
    </Panel>
  )
}

export function ChangeEmail({ current }: { current: string }) {
  const t = useTranslations('account')
  const common = useTranslations('common')
  const { busy, errors, done, submit } = useAction()
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')

  return (
    <Panel summary={t('email')} hint={current}>
      <form
        aria-busy={busy}
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
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'profile-email-error' : undefined}
          type="email"
          className={INPUT}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
        <FieldError id="profile-email-error" message={errors.email} />

        <label className={`${LABEL} mt-4`} htmlFor="profile-email-password">
          Your current password
        </label>
        <input
          id="profile-email-password"
          aria-invalid={Boolean(errors.currentPassword)}
          aria-describedby={errors.currentPassword ? 'profile-email-password-error' : undefined}
          type="password"
          className={INPUT}
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        <FieldError id="profile-email-password-error" message={errors.currentPassword} />
        <FieldError message={errors.form} />

        {/* Said before they submit, not after. Changing the address signs the
            account out of nothing but does make it unverified until the link is
            followed, and finding that out afterwards is a surprise. */}
        <p className="text-ink-500 mt-3 text-xs leading-relaxed">
          We will send a link to the new address to confirm it, and tell your old address that it
          changed.
        </p>

        {done ? (
          <p role="status" className={`${NOTICE_SUCCESS} mt-3`}>
            {done}
          </p>
        ) : null}

        <button className={`${PRIMARY_BUTTON} mt-4`} disabled={busy}>
          {busy ? t('working') : common('save')}
        </button>
      </form>
    </Panel>
  )
}

export function ChangePassword() {
  const t = useTranslations('account')
  const common = useTranslations('common')
  const { busy, errors, done, submit } = useAction()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')

  return (
    <Panel summary={t('password')}>
      <form
        aria-busy={busy}
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
          aria-invalid={Boolean(errors.currentPassword)}
          aria-describedby={errors.currentPassword ? 'profile-current-password-error' : undefined}
          type="password"
          className={INPUT}
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        <FieldError id="profile-current-password-error" message={errors.currentPassword} />

        <label className={`${LABEL} mt-4`} htmlFor="profile-new-password">
          {t('newPassword')}
        </label>
        <input
          id="profile-new-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={
            errors.password
              ? 'profile-new-password-hint profile-new-password-error'
              : 'profile-new-password-hint'
          }
          type="password"
          className={INPUT}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={10}
          required
        />
        <FieldError id="profile-new-password-error" message={errors.password} />
        <FieldError message={errors.form} />

        <p id="profile-new-password-hint" className="text-ink-500 mt-2 text-xs">
          {t('rule_length')}
        </p>

        {done ? (
          <p role="status" className={`${NOTICE_SUCCESS} mt-3`}>
            {done}
          </p>
        ) : null}

        <button className={`${PRIMARY_BUTTON} mt-4`} disabled={busy}>
          {busy ? t('working') : common('save')}
        </button>
      </form>
    </Panel>
  )
}
