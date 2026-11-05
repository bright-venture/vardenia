'use client'

import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Lock, Mail } from 'lucide-react'
import { Link, useRouter } from '../i18n/routing'
import {
  FIELD_ICON,
  HINT,
  INPUT_ICON,
  LABEL,
  LINK,
  NOTICE_ERROR,
  PRIMARY_BUTTON,
} from './formStyles'
import { safeNextPath } from '../lib/safe-next'
import { markSignedIn } from '../lib/session-hint'

/**
 * Signing a customer in.
 *
 * Posts to Payload's own `/api/customers/login`, which is left public
 * deliberately: it creates nothing, and `maxLoginAttempts` with `lockTime` on
 * the collection already throttles the one thing it does that is worth
 * throttling. Sign-up is the endpoint that needed its own door, not this.
 *
 * # Two failures, told apart by status code
 *
 * Payload answers 401 for a wrong email or password and 403 for an account whose
 * address has not been verified. Those need different sentences - one asks you
 * to try again, the other tells you to go and read your email - and branching on
 * the status is how to tell them apart without matching on English error text
 * that would be wrong on the Arabic page anyway.
 *
 * An account locked by too many attempts also comes back as 401, so it reads as
 * "wrong password". That is the wrong sentence but the right amount of
 * information: saying "this account is locked" confirms the address has an
 * account, which is the disclosure /auth/signup is arranged to avoid.
 *
 * The reply carries the session cookie. Nothing is stored here - no token in
 * localStorage, where any script on the page could read it.
 */
export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations('account')
  const common = useTranslations('common')
  const router = useRouter()
  const ids = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [resent, setResent] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [resendProblem, setResendProblem] = useState<string | null>(null)
  const submitting = useRef(false)
  const resendingRequest = useRef(false)

  function changeEmail(value: string) {
    setEmail(value)
    setProblem(null)
    setUnverifiedEmail(null)
    setResent(null)
    setResendProblem(null)
  }

  async function resendVerification() {
    if (!unverifiedEmail || resendingRequest.current || submitting.current) return
    resendingRequest.current = true
    setResending(true)
    setResendProblem(null)
    try {
      const response = await fetch('/auth/verify/resend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        // Resend only for the address from the refused sign-in, never a later edit.
        body: JSON.stringify({ email: unverifiedEmail }),
      })
      const body = (await response.json().catch(() => null)) as { message?: string } | null
      if (response.ok) {
        setResent(body?.message ?? t('checkEmail'))
      } else {
        setResendProblem(body?.message ?? common('error'))
      }
    } catch {
      setResendProblem(common('error'))
    } finally {
      resendingRequest.current = false
      setResending(false)
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || resendingRequest.current) return
    submitting.current = true
    setUnverifiedEmail(null)
    setResent(null)
    setResendProblem(null)
    setProblem(null)
    setBusy(true)

    try {
      const response = await fetch('/api/customers/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password }),
      })

      if (response.ok) {
        // The header reads this to know which links to offer.
        markSignedIn('customer')
        /**
         * `refresh` before `push`, and both are needed. The account page is a
         * server component that reads the session, and Next would otherwise
         * serve it from the router cache - the version rendered for a signed-out
         * visitor, which is the sign-in prompt they just came from.
         */
        router.refresh()
        // See lib/safe-next. `?next=` is attacker-supplied, and the guard this
        // replaced accepted `//evil.com` as an internal path.
        router.push(safeNextPath(next, '/account'))
        return
      }

      /**
       * 403 is the unverified case, and it is a dead end without a way out.
       *
       * Payload refuses to authenticate an unverified customer at all, so this
       * reader has no session and cannot ask for anything that needs one. The
       * resend below takes the address they just typed, which is the only
       * credential they have.
       */
      if (response.status === 403) {
        setUnverifiedEmail(email)
        setProblem(t('unverified'))
        return
      }

      setProblem(t('signInFailed'))
    } catch {
      setProblem(common('error'))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-busy={busy || resending}
      className="flex flex-col gap-5"
      noValidate
    >
      {problem ? (
        <div className={NOTICE_ERROR}>
          <p role="alert">{problem}</p>
          {unverifiedEmail ? (
            resent ? (
              <p className="mt-2 text-sm" role="status">
                {resent}
              </p>
            ) : (
              <>
                {resendProblem ? (
                  <p className="mt-2 text-sm" role="alert">
                    {resendProblem}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={resending}
                  className={`${LINK} focus-visible:outline-gold-500 mt-2 block min-h-11 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60`}
                  onClick={resendVerification}
                >
                  {resending ? t('working') : t('resendVerification')}
                </button>
              </>
            )
          ) : null}
        </div>
      ) : null}

      {/*
        Icons inside the fields, per the reference. They are `aria-hidden`: the
        label above each one already names it, and "envelope, Email" is a worse
        reading of the same field. What they buy is a stack of two identical
        boxes becoming scannable at a glance.
      */}
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
            disabled={busy || resending}
            autoComplete="email"
            value={email}
            onChange={(e) => changeEmail(e.target.value)}
            className={INPUT_ICON}
          />
        </div>
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
            disabled={busy || resending}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT_ICON}
          />
        </div>

        {/* On the same row as the field it belongs to, per the reference, rather
            than three lines below the button. It is also the way out of the
            "check your email first" refusal above: a guest booker claiming
            their record gets a reset rather than a verification mail, so the
            reset link is what proves their address. */}
        <p className="mt-2 flex justify-end">
          <Link href="/account/forgot" className={`${LINK} text-xs`}>
            {t('forgot')}
          </Link>
        </p>
      </div>

      <button type="submit" disabled={busy || resending} className={PRIMARY_BUTTON}>
        {busy ? t('working') : t('submitSignIn')}
      </button>

      <p className={`${HINT} text-center`}>
        {t('noAccount')}{' '}
        <Link href="/account/signup" className={LINK}>
          {t('signUp')}
        </Link>
      </p>
    </form>
  )
}
