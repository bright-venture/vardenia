'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Locale } from '@vardenia/i18n'
import { Turnstile, type TurnstileHandle } from './Turnstile'
import { INPUT, LABEL, NOTICE_ERROR, NOTICE_SUCCESS, PRIMARY_BUTTON } from './formStyles'

/**
 * "Ask us a question", at the foot of the Questions page (18 November 2026).
 * No account needed; the Vardenia team answers by email. See /booking/question.
 */
export function AskQuestionForm({ locale }: { locale: Locale }) {
  const t = useTranslations('askQuestion')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [question, setQuestion] = useState('')
  const [website, setWebsite] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const turnstile = useRef<TurnstileHandle | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/booking/question', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, question, website, locale, turnstileToken: token }),
      })
      if (response.ok) {
        setSent(true)
        return
      }
      turnstile.current?.reset()
      setError(response.status === 429 ? t('tooMany') : t('error'))
    } catch {
      setError(t('error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="vd-ask-question border-ink-100 bg-surface-raised mt-12 border p-6 sm:p-8">
      <h2 className="font-display text-ink-900 text-2xl">{t('title')}</h2>
      <p className="text-ink-700 mt-2 text-sm">{t('intro')}</p>

      {sent ? (
        <p className={`${NOTICE_SUCCESS} mt-6`} role="status">
          {t('sent')}
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>{t('name')}</span>
              <input
                className={`${INPUT} mt-1`}
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={LABEL}>{t('email')}</span>
              <input
                className={`${INPUT} mt-1`}
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          </div>
          <label className="block">
            <span className={LABEL}>{t('question')}</span>
            <textarea
              className={`${INPUT} mt-1`}
              required
              minLength={5}
              maxLength={2000}
              rows={5}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          {/* A trap for bots: hidden from people and screen readers. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          <Turnstile onToken={setToken} handle={turnstile} locale={locale} />
          {error ? (
            <p className={NOTICE_ERROR} role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
            {busy ? t('sending') : t('send')}
          </button>
        </form>
      )}
    </section>
  )
}
