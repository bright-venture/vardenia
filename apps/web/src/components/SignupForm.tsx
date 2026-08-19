'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Locale } from '@vardenia/i18n'
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
 * Opening a customer account.
 *
 * Posts to `/auth/signup`, not to `/api/customers`. The collection keeps
 * `create: isStaff` because Payload's generic create endpoint accepts whatever
 * it is sent and has no throttle in front of it in Payload 3; the route this
 * posts to is rate-limited and knows what to do about an address that already
 * exists.
 *
 * # The success panel says nothing about whether you have an account
 *
 * Every outcome comes back as the same 202 with the same sentence, and this
 * renders it as it arrives. That is the whole point of the endpoint: a form that
 * said "that address is already registered" would be an oracle anybody could
 * query to find out who has an account on a directory of hotels and clinics.
 *
 * So this must never try to be more helpful than the answer it was given. What
 * differs between outcomes is only which email is sent - a verification link for
 * a new address, a password reset for one that already has a record, including
 * the record created when somebody booked as a guest.
 */
export function SignupForm({ locale }: { locale: Locale }) {
  const t = useTranslations('account')
  const common = useTranslations('common')
  const ids = useId()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')

  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sent, setSent] = useState<string | null>(null)

  const field = (key: string) => (errors[key] ? `${INPUT} ${INPUT_ERROR}` : INPUT)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProblem(null)
    setErrors({})
    setBusy(true)

    try {
      const response = await fetch('/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name,
          email,
          password,
          ...(phone.trim() ? { phone } : {}),
          locale,
        }),
      })

      const body = (await response.json().catch(() => null)) as {
        ok?: boolean
        message?: string
        errors?: Record<string, string>
      } | null

      if (response.ok && body?.ok) {
        setSent(body.message ?? t('checkEmail'))
        return
      }

      // 400 with field errors is the only failure the endpoint reports, and it
      // is about the shape of the input rather than about the account.
      if (body?.errors) {
        setErrors(body.errors)
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
        <p>{sent}</p>
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
        <label className={LABEL} htmlFor={`${ids}-name`}>
          {t('name')}
        </label>
        <input
          id={`${ids}-name`}
          type="text"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`mt-1.5 ${field('name')}`}
          aria-describedby={errors.name ? `${ids}-name-error` : undefined}
        />
        {errors.name ? (
          <p id={`${ids}-name-error`} className={ERROR_TEXT}>
            {errors.name}
          </p>
        ) : null}
      </div>

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
          className={`mt-1.5 ${field('email')}`}
          aria-describedby={errors.email ? `${ids}-email-error` : undefined}
        />
        {errors.email ? (
          <p id={`${ids}-email-error`} className={ERROR_TEXT}>
            {errors.email}
          </p>
        ) : null}
      </div>

      <div>
        <label className={LABEL} htmlFor={`${ids}-password`}>
          {t('password')}
        </label>
        <input
          id={`${ids}-password`}
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`mt-1.5 ${field('password')}`}
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

      <div>
        <label className={LABEL} htmlFor={`${ids}-phone`}>
          {t('phone')}
        </label>
        <input
          id={`${ids}-phone`}
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={`mt-1.5 ${INPUT}`}
          aria-describedby={`${ids}-phone-hint`}
        />
        <p id={`${ids}-phone-hint`} className={HINT}>
          {t('phoneOptional')}
        </p>
      </div>

      <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
        {busy ? t('working') : t('submitSignUp')}
      </button>

      <p className={HINT}>
        {t('haveAccount')}{' '}
        <Link href="/account/login" className={LINK}>
          {t('signIn')}
        </Link>
      </p>
    </form>
  )
}
