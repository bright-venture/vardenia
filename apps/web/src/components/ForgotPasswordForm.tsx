'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '../i18n/routing'
import {
  HINT,
  INPUT,
  LABEL,
  LINK,
  NOTICE_ERROR,
  NOTICE_SUCCESS,
  PRIMARY_BUTTON,
} from './formStyles'

/**
 * Asking for a reset link.
 *
 * Posts straight to Payload's `/api/customers/forgot-password`, which is one of
 * the few of its endpoints that needs nothing from us. It looks the address up
 * and, when there is no such customer, returns without saying so - its own
 * source comments that indicating otherwise "could lead to the exposure of
 * registered emails". That is the same reasoning `/auth/signup` is built on, so
 * there is nothing to add.
 *
 * The panel afterwards is worded to match: it never confirms that an account
 * exists.
 */
export function ForgotPasswordForm() {
  const t = useTranslations('account')
  const common = useTranslations('common')
  const ids = useId()

  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProblem(null)
    setBusy(true)

    try {
      const response = await fetch('/api/customers/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email }),
      })

      if (response.ok) {
        setSent(true)
        return
      }

      setProblem(common('error'))
    } catch {
      setProblem(common('error'))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className={NOTICE_SUCCESS} role="status">
        <p>{t('forgotSent')}</p>
        <p className="mt-4">
          <Link href="/account/login" className={LINK}>
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
        <label className={LABEL} htmlFor={`${ids}-email`}>
          {t('email')}
        </label>
        <input
          id={`${ids}-email`}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`mt-1.5 ${INPUT}`}
        />
      </div>

      <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
        {busy ? t('working') : t('sendResetLink')}
      </button>

      <p className={HINT}>
        <Link href="/account/login" className={LINK}>
          {t('signIn')}
        </Link>
      </p>
    </form>
  )
}
