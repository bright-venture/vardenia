'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Locale } from '@vardenia/i18n'
import { useDesktopEdition } from './editorial/useDesktopEdition'
import { Link } from '../i18n/routing'
import { CONTACT } from '../lib/contact'
import { Turnstile, type TurnstileHandle } from './Turnstile'
import { INPUT, LABEL, NOTICE_ERROR, NOTICE_SUCCESS, PRIMARY_BUTTON } from './formStyles'

/**
 * "Ask us a question", at the foot of the Questions page (18 November 2026).
 * No account needed; the Vardenia team answers by email. See /booking/question.
 */
type Topic = 'faq' | 'contact' | 'advertise'

const headings = {
  faq: 'Still have a question?',
  contact: 'Contact the Vardenia team',
  advertise: 'Tell us about your campaign',
} as const

export function AskQuestionForm({ locale, topic = 'faq' }: { locale: Locale; topic?: Topic }) {
  const desktop = useDesktopEdition(locale)
  const [subject, setSubject] = useState('')
  const prefix = topic === 'contact' ? 'Contact enquiry' : 'Campaign enquiry'
  const subjectLine = topic === 'faq' ? '' : `${prefix}${subject.trim() ? ' — ' + subject.trim() : ''}\n\n`
  const heading = headings[topic]
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
    const message = subjectLine + question
    if (message.length > 2000) {
      setError('Please shorten your message or subject before sending.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/booking/question', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, question: message, website, locale, turnstileToken: token }),
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

  if (topic !== 'faq' && !desktop) return null

  return (
    <section
      id="enquiry" tabIndex={-1} aria-labelledby="enquiry-heading"
      className={`vd-ask-question ${desktop ? 'vd-enquiry' : ''} border-ink-100 bg-surface-raised mt-12 border p-6 sm:p-8`}
    >
      <h2 id="enquiry-heading" className="font-display text-ink-900 text-2xl">{desktop ? heading : t('title')}</h2>
      <p className="text-ink-700 mt-2 text-sm">{desktop ? 'Send your message and we’ll reply by email.' : t('intro')}</p>

      {sent ? (
        <p className={`${NOTICE_SUCCESS} mt-6`} role="status">
          {topic === 'faq' ? t('sent') : 'Your message has been received. We’ll reply by email.'}
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
          {topic !== 'faq' && (
            <label className="block">
              <span className={LABEL}>Subject (optional)</span>
              <input className={`${INPUT} mt-1`} maxLength={160} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </label>
          )}
          <label className="block">
            <span className={LABEL}>{topic === 'faq' ? t('question') : 'Your message'}</span>
            <textarea
              className={`${INPUT} mt-1`}
              required
              minLength={5}
              maxLength={2000 - subjectLine.length}
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
          {desktop && (
            <p className="text-ink-500 text-sm">
              We use these details to respond to your enquiry. <Link href="/legal/privacy" className="underline underline-offset-4">Privacy policy</Link>
            </p>
          )}
          <Turnstile onToken={setToken} handle={turnstile} locale={locale} />
          {error ? (
            <p className={NOTICE_ERROR} role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
            {busy ? t('sending') : desktop ? 'Send message' : t('send')}
          </button>
        </form>
      )}
      {desktop && (
        <div className="text-ink-700 mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {CONTACT.email && <a href={`mailto:${CONTACT.email}`} className="underline underline-offset-4">{CONTACT.email}</a>}
          {CONTACT.phone && <a href={`tel:${CONTACT.phone.replace(/[^+\d]/g, '')}`} className="underline underline-offset-4" dir="ltr">{CONTACT.phone}</a>}
        </div>
      )}
    </section>
  )
}
