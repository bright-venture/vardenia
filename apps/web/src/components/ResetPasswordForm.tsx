'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '../i18n/routing'
import {
  ERROR_TEXT,
  HINT,
  INPUT,
  INPUT_ERROR,
  LABEL,
  LINK,
  NOTICE_ERROR,
  NOTICE_SUCCESS,
  PRIMARY_BUTTON,
} from './formStyles'

/**
 * Choosing a password from a reset link.
 *
 * Posts to `/auth/reset` rather than Payload's `/api/customers/reset-password`,
 * because ours also marks the address verified - see that route for why a guest
 * booker is otherwise stuck forever.
 *
 * The token is held in a hidden field rather than read from the URL by this
 * component, so the page decides what counts as the token and this only submits
 * it. It never appears in a `fetch` URL, only in the body.
 */
export function ResetPasswordForm({
  token,
  endpoint = '/auth/reset',
  signInHref = '/account/login',
}: {
  token: string
  /**
   * Customers post to our own route, which also marks the address verified -
   * see /auth/reset for the guest-booker case that needs. Partners post to
   * Payload's own endpoint, because `business-users` has no verification to
   * carry and there is nothing for a route of ours to add.
   */
  endpoint?: string
  signInHref?: string
}) {
  const t = useTranslations('account')
  const common = useTranslations('common')
  const ids = useId()

  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProblem(null)
    setErrors({})
    setBusy(true)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, password }),
      })

      /**
       * Two endpoints, two reply shapes.
       *
       * Ours answers `{ ok, errors: { field: message } }`. Payload's answers
       * `{ message, user }` on success and `{ errors: [{ message }] }` on
       * failure - no `ok` at all. Requiring `body.ok` therefore read every
       * successful partner reset as a failure, and treating its error array as a
       * field map put `[object Object]` under the password box.
       */
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean
        message?: string
        errors?: Record<string, string> | { message?: string }[]
      } | null

      // The status is the thing both agree on.
      if (response.ok) {
        setDone(true)
        return
      }

      // Ours: a map of field to message, rendered under the input it belongs to.
      if (body?.errors && !Array.isArray(body.errors)) {
        setErrors(body.errors)
        return
      }

      // Payload's: a list, and about the token rather than about a field. An
      // expired or spent link is the overwhelmingly likely cause, so it belongs
      // at the top of the form rather than under the password box.
      const first = Array.isArray(body?.errors) ? body.errors[0]?.message : undefined
      setProblem(first ?? body?.message ?? common('error'))
    } catch {
      setProblem(common('error'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className={NOTICE_SUCCESS} role="status">
        <p>{t('resetDone')}</p>
        <p className="mt-4">
          <Link href={signInHref} className={LINK}>
            {t('signIn')}
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {problem ? (
        <p className={NOTICE_ERROR} role="alert">
          {problem}
        </p>
      ) : null}

      <div>
        <label className={LABEL} htmlFor={`${ids}-password`}>
          {t('newPassword')}
        </label>
        <input
          id={`${ids}-password`}
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`mt-1.5 ${errors.password ? `${INPUT} ${INPUT_ERROR}` : INPUT}`}
          aria-describedby={errors.password ? `${ids}-password-error` : `${ids}-password-hint`}
        />
        {errors.password ? (
          <p id={`${ids}-password-error`} className={ERROR_TEXT}>
            {errors.password}
          </p>
        ) : (
          <p id={`${ids}-password-hint`} className={HINT}>
            {t('passwordHint')}
          </p>
        )}
      </div>

      <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
        {busy ? t('working') : t('setPassword')}
      </button>
    </form>
  )
}
