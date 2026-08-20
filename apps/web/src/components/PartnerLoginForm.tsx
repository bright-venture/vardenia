'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '../i18n/routing'
import { HINT, INPUT, LABEL, NOTICE_ERROR, PRIMARY_BUTTON } from './formStyles'

/**
 * Signing in a business owner.
 *
 * Its own form rather than the customer one with a prop, because the two differ
 * in what they must *not* offer. There is no sign-up link: accounts are created
 * by staff during onboarding, since a partner registering themselves would mean
 * solving "prove you own this restaurant", which is the verification problem
 * large directories still lose to. And there is no verification branch, because
 * the account is made by the person standing in the building.
 *
 * Posts to `/api/business-users/login`. `maxLoginAttempts` is 5 here against a
 * customer's 10, and the session is four hours rather than a week - these
 * credentials live on a phone behind a bar, not on a laptop the team controls.
 *
 * # Signing in here replaces a staff session in the same browser
 *
 * Payload issues one cookie name for every auth collection. Worth knowing before
 * it surprises somebody testing this while logged into the admin: the admin tab
 * will quietly become signed out.
 */
export function PartnerLoginForm() {
  const t = useTranslations('partner')
  const common = useTranslations('common')
  const router = useRouter()
  const ids = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProblem(null)
    setBusy(true)

    try {
      const response = await fetch('/api/business-users/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password }),
      })

      if (response.ok) {
        // `refresh` before `push`: the dashboard is a server component that
        // reads the session, and the router cache still holds the signed-out
        // version of it.
        router.refresh()
        router.push('/partner')
        return
      }

      /**
       * One message for every refusal, including a locked account. Saying "this
       * account is locked" confirms the address belongs to a partner of ours,
       * which is commercial information about who we work with.
       */
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
        {busy ? t('working') : t('signIn')}
      </button>

      {/* No sign-up link, deliberately. See the note at the top. */}
      <p className={HINT}>{t('noSelfSignup')}</p>
    </form>
  )
}
