'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '../i18n/routing'
import { HINT, INPUT, LABEL, LINK, NOTICE_ERROR, PRIMARY_BUTTON } from './formStyles'
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
  const [unverified, setUnverified] = useState(false)
  const [resent, setResent] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
        setUnverified(true)
        setProblem(t('unverified'))
        return
      }

      setProblem(t('signInFailed'))
    } catch {
      setProblem(common('error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {problem ? (
        <div className={NOTICE_ERROR} role="alert">
          <p>{problem}</p>

          {/* The only way out of this refusal.
              Payload will not authenticate an unverified customer at all, so
              there is no session to prove anything with and no signed-in page
              to offer this from. The address typed above is the credential. */}
          {unverified ? (
            resent ? (
              <p className="mt-2 text-sm">{resent}</p>
            ) : (
              <button
                type="button"
                className={`${LINK} mt-2 block text-sm`}
                onClick={async () => {
                  const r = await fetch('/auth/verify/resend', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ email }),
                  }).catch(() => null)
                  const b = (await r?.json().catch(() => null)) as { message?: string } | null
                  setResent(b?.message ?? common('error'))
                }}
              >
                {t('resendVerification')}
              </button>
            )
          ) : null}
        </div>
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

      <div>
        <label className={LABEL} htmlFor={`${ids}-password`}>
          {t('password')}
        </label>
        <input
          id={`${ids}-password`}
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`mt-1.5 ${INPUT}`}
        />
      </div>

      <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
        {busy ? t('working') : t('submitSignIn')}
      </button>

      <p className={HINT}>
        {t('noAccount')}{' '}
        <Link href="/account/signup" className={LINK}>
          {t('signUp')}
        </Link>
      </p>

      {/* Reachable from the one screen where somebody discovers they need it.
          It is also the way out of the "check your email first" refusal above:
          a guest booker claiming their record gets a reset rather than a
          verification mail, so the reset link is what proves their address. */}
      <p className={HINT}>
        <Link href="/account/forgot" className={LINK}>
          {t('forgot')}
        </Link>
      </p>
    </form>
  )
}
