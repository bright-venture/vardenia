'use client'

import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { Turnstile, type TurnstileHandle } from './Turnstile'
import { Lock, Mail, Phone, User } from 'lucide-react'
import { PasswordStrength } from './ui/PasswordStrength'
import {
  ERROR_TEXT,
  FIELD_ICON,
  HINT,
  INPUT_ERROR,
  INPUT_ICON,
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

  /**
   * Null until the widget solves, and null again after a refusal.
   *
   * The submit button is deliberately NOT disabled while it is null. A person
   * whose challenge has not finished, or whose network ate the script, would
   * otherwise face a button that never enables and says nothing about why -
   * which is worse than letting them submit and telling them what happened.
   */
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstile = useRef<TurnstileHandle | null>(null)

  const field = (key: string) => (errors[key] ? `${INPUT_ICON} ${INPUT_ERROR}` : INPUT_ICON)

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
          ...(turnstileToken ? { turnstileToken } : {}),
          locale,
        }),
      })

      const body = (await response.json().catch(() => null)) as {
        ok?: boolean
        message?: string
        errors?: Record<string, string>
        code?: string
      } | null

      if (response.ok && body?.ok) {
        setSent(body.message ?? t('checkEmail'))
        return
      }

      // 400 with field errors is about the shape of the input rather than about
      // the account.
      if (body?.errors) {
        setErrors(body.errors)
        return
      }

      /**
       * A refused challenge, which is why the endpoint answers 403 rather than
       * folding this into the 400. A Turnstile token is single use, so the
       * widget has to be reset or a second attempt sends a spent token and is
       * refused again for a reason the reader cannot see.
       */
      if (response.status === 403) {
        turnstile.current?.reset()
        setProblem(body?.message ?? common('error'))
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
        <div className="relative mt-1.5">
          <span className={FIELD_ICON} aria-hidden>
            <User className="size-4" strokeWidth={1.75} />
          </span>
          <input
            id={`${ids}-name`}
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field('name')}
            aria-describedby={errors.name ? `${ids}-name-error` : undefined}
          />
        </div>
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
        <div className="relative mt-1.5">
          <span className={FIELD_ICON} aria-hidden>
            <Mail className="size-4" strokeWidth={1.75} />
          </span>
          <input
            id={`${ids}-email`}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field('email')}
            aria-describedby={errors.email ? `${ids}-email-error` : undefined}
          />
        </div>
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
        <div className="relative mt-1.5">
          <span className={FIELD_ICON} aria-hidden>
            <Lock className="size-4" strokeWidth={1.75} />
          </span>
          <input
            id={`${ids}-password`}
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field('password')}
            aria-describedby={errors.password ? `${ids}-password-error` : `${ids}-password-hint`}
          />
        </div>

        {errors.password ? (
          <p id={`${ids}-password-error`} className={ERROR_TEXT}>
            {errors.password}
          </p>
        ) : null}

        {/*
          The meter carries the hint, so the hint is not printed twice.

          It measures length and warns about guessable patterns - it does not
          demand a capital, a digit and a symbol the way the component it is
          adapted from does. That checklist would contradict both the sentence
          beside it and the server: see ui/PasswordStrength, and the rule itself
          in packages/core/booking-request.
        */}
        {/* `name` and `email` are handed over so a password built out of them
            can be refused. They are typed above this field, so by the time
            somebody reaches the password box the check has something to work
            with. Nothing leaves the browser: the comparison happens here. */}
        <PasswordStrength
          value={password}
          name={name}
          email={email}
          className={errors.password ? 'mt-3' : 'mt-2.5'}
        />
        <span id={`${ids}-password-hint`} className="sr-only">
          {t('passwordHint')}
        </span>
      </div>

      <div>
        <label className={LABEL} htmlFor={`${ids}-phone`}>
          {t('phone')}
        </label>
        <div className="relative mt-1.5">
          <span className={FIELD_ICON} aria-hidden>
            <Phone className="size-4" strokeWidth={1.75} />
          </span>
          <input
            id={`${ids}-phone`}
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={INPUT_ICON}
            aria-describedby={`${ids}-phone-hint`}
          />
        </div>
        <p id={`${ids}-phone-hint`} className={HINT}>
          {t('phoneOptional')}
        </p>
      </div>

      {/* Said before the button, not after it. This is the moment consent is
          actually given, and a line of small print underneath a button somebody
          has already pressed is not consent. No tick box: under GDPR, consent
          is not the lawful basis for running an account you asked us to open -
          a pre-ticked or mandatory box would misrepresent what is happening. */}
      <p className={HINT}>
        {t.rich('agreeOnSignup', {
          terms: (chunks) => (
            <Link href="/legal/terms" className={LINK}>
              {chunks}
            </Link>
          ),
          privacy: (chunks) => (
            <Link href="/legal/privacy" className={LINK}>
              {chunks}
            </Link>
          ),
        })}
      </p>

      {/* Renders nothing until a site key is set. See components/Turnstile. */}
      <Turnstile onToken={setTurnstileToken} handle={turnstile} locale={locale} />

      <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
        {busy ? t('working') : t('submitSignUp')}
      </button>

      <p className={`${HINT} text-center`}>
        {t('haveAccount')}{' '}
        <Link href="/account/login" className={LINK}>
          {t('signIn')}
        </Link>
      </p>
    </form>
  )
}
