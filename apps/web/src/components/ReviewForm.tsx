'use client'

import { useId, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import type { Locale } from '@vardenia/i18n'
import { Link, usePathname } from '../i18n/routing'
import { sessionAudience } from '../lib/session-hint'
import {
  ERROR_TEXT,
  INPUT,
  LABEL,
  LINK,
  NOTICE_ERROR,
  NOTICE_INFO,
  NOTICE_SUCCESS,
  PRIMARY_BUTTON,
} from './formStyles'

/**
 * Leave a review. Shown under a listing's reviews.
 *
 * Like the booking form, the listing page is prerendered and cannot know who is
 * reading it, so the resting state comes from the `vd_session` hint cookie and
 * the server is the authority: a signed-out reader sees a prompt, and eligibility
 * - a completed booking here, not already reviewed - is only ever decided by
 * /reviews on submit. Refusals come back as a `code` this maps to a message, so
 * "you have not booked here" and "you already reviewed this" read as the
 * different things they are.
 */

const subscribeToSession = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange)
  window.addEventListener('focus', onChange)
  return () => {
    document.removeEventListener('visibilitychange', onChange)
    window.removeEventListener('focus', onChange)
  }
}

export function ReviewForm({ businessId, locale }: { businessId: number; locale: Locale }) {
  const t = useTranslations('review')
  const common = useTranslations('common')
  const ids = useId()

  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ratingError, setRatingError] = useState(false)

  const audience = useSyncExternalStore(subscribeToSession, sessionAudience, () => null)
  const signedIn = audience === 'customer'
  const next = usePathname()

  const messageFor = (code: string | undefined): string => {
    switch (code) {
      case 'not-eligible':
        return t('notEligible')
      case 'already-reviewed':
        return t('alreadyReviewed')
      case 'unverified':
        return t('unverified')
      default:
        return common('error')
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setRatingError(false)

    if (rating < 1) {
      setRatingError(true)
      return
    }

    setBusy(true)
    try {
      const response = await fetch('/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          business: businessId,
          rating,
          ...(title.trim() ? { title } : {}),
          body,
          locale,
        }),
      })

      if (response.status === 201) {
        setDone(true)
        return
      }

      const payload = (await response.json().catch(() => null)) as { code?: string } | null
      setError(messageFor(payload?.code))
    } catch {
      setError(common('error'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className={`${NOTICE_SUCCESS} mt-6`} role="status">
        <p className="font-semibold">{t('successTitle')}</p>
        <p className="mt-2">{t('successBody')}</p>
      </div>
    )
  }

  if (!signedIn) {
    return (
      <div className={`${NOTICE_INFO} mt-6`}>
        <p>{t('signInPrompt')}</p>
        <Link
          href={{ pathname: '/account/login', query: { next } }}
          className={`${LINK} mt-2 inline-block`}
        >
          {t('signIn')}
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
      <p className="text-ink-900 font-medium">{t('write')}</p>

      {error ? (
        <p className={NOTICE_ERROR} role="alert">
          {error}
        </p>
      ) : null}

      <div>
        <span className={LABEL}>{t('yourRating')}</span>
        <div className="mt-1.5 flex gap-1" role="radiogroup" aria-label={t('yourRating')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={String(n)}
              onClick={() => {
                setRating(n)
                setRatingError(false)
              }}
              className={`text-2xl leading-none ${n <= rating ? 'text-gold-500' : 'text-ink-100'}`}
            >
              {n <= rating ? '★' : '☆'}
            </button>
          ))}
        </div>
        {ratingError ? <p className={ERROR_TEXT}>{t('yourRating')}</p> : null}
      </div>

      <div>
        <label className={LABEL} htmlFor={`${ids}-title`}>
          {t('titleLabel')}
        </label>
        <input
          id={`${ids}-title`}
          type="text"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`mt-1.5 ${INPUT}`}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor={`${ids}-body`}>
          {t('bodyLabel')}
        </label>
        <textarea
          id={`${ids}-body`}
          required
          rows={4}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`mt-1.5 ${INPUT}`}
        />
      </div>

      <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON} self-start`}>
        {busy ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}
