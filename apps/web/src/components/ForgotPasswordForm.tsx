'use client'

import { useEffect, useId, useRef, useState } from 'react'
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
export function ForgotPasswordForm({
  collection = 'customers',
  signInHref = '/account/login',
}: {
  collection?: 'customers' | 'business-users'
  signInHref?: string
} = {}) {
  const t = useTranslations('account')
  const common = useTranslations('common')
  const ids = useId()

  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const successRef = useRef<HTMLDivElement>(null)
  const submitting = useRef(false)

  useEffect(() => {
    if (sent) successRef.current?.focus()
  }, [sent])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setProblem(null)
    setBusy(true)

    try {
      const response = await fetch(`/api/${collection}/forgot-password`, {
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
      submitting.current = false
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        className={`${NOTICE_SUCCESS} focus-visible:outline-gold-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
        role="status"
      >
        <p>{t('forgotSent')}</p>
        <p className="mt-4">
          <Link
            href={signInHref}
            className={`${LINK} focus-visible:outline-gold-500 inline-flex min-h-11 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
          >
            {t('signIn')}
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} aria-busy={busy} className="flex flex-col gap-5" noValidate>
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
        <Link
          href={signInHref}
          className={`${LINK} focus-visible:outline-gold-500 inline-flex min-h-11 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
        >
          {t('signIn')}
        </Link>
      </p>
    </form>
  )
}
