'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '../i18n/routing'
import {
  HINT,
  INPUT,
  LABEL,
  LINK,
  NOTICE_ERROR,
  NOTICE_INFO,
  NOTICE_SUCCESS,
  SECONDARY_BUTTON,
} from './formStyles'

/**
 * Closing an account, on a page of its own.
 *
 * Not a button on the account page. This is irreversible, it cancels upcoming
 * reservations, and a control that does that sitting next to "Sign out" is a
 * control somebody eventually presses by accident.
 *
 * The password is asked for again because a session cookie proves possession of
 * a browser, not identity - and this is the one action where that distinction
 * is worth the friction.
 *
 * The destructive button is deliberately the quiet one. Nothing here should
 * invite a press.
 */
export function CloseAccountForm({ upcoming }: { upcoming: number }) {
  const t = useTranslations('account')
  const common = useTranslations('common')
  const router = useRouter()
  const ids = useId()

  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [closed, setClosed] = useState<number | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProblem(null)
    setBusy(true)

    try {
      const response = await fetch('/auth/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password }),
      })

      const body = (await response.json().catch(() => null)) as {
        ok?: boolean
        cancelled?: number
        message?: string
      } | null

      if (response.ok && body?.ok) {
        setClosed(body.cancelled ?? 0)
        // The session is worthless now, but the cookie is still in the browser
        // and every server component would keep reading it.
        await fetch('/api/customers/logout', { method: 'POST', credentials: 'same-origin' })
        router.refresh()
        return
      }

      setProblem(body?.message ?? common('error'))
    } catch {
      setProblem(common('error'))
    } finally {
      setBusy(false)
    }
  }

  if (closed !== null) {
    return (
      <div className={NOTICE_SUCCESS} role="status">
        <p>{t('closeDone')}</p>
        {closed > 0 ? <p className="mt-2">{t('closeCancelled', { count: closed })}</p> : null}
        <p className="mt-4">
          <Link href="/directory" className={LINK}>
            {t('browse')}
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <p className={NOTICE_INFO}>{t('closeWhatHappens')}</p>

      {/* Said plainly and before the form, because it is the consequence people
          do not anticipate. */}
      {upcoming > 0 ? (
        <p className={NOTICE_ERROR}>{t('closeUpcomingWarning', { count: upcoming })}</p>
      ) : null}

      {problem ? (
        <p className={NOTICE_ERROR} role="alert">
          {problem}
        </p>
      ) : null}

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
          aria-describedby={`${ids}-hint`}
        />
        <p id={`${ids}-hint`} className={HINT}>
          {t('closePasswordHint')}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className={`${SECONDARY_BUTTON} border-state-danger text-state-danger`}
        >
          {busy ? t('working') : t('closeConfirm')}
        </button>
        <Link href="/account" className={LINK}>
          {t('closeKeep')}
        </Link>
      </div>
    </form>
  )
}
