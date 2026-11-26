'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { HINT, NOTICE_ERROR, NOTICE_INFO, PRIMARY_BUTTON, SECONDARY_BUTTON } from '../formStyles'
import { fetchTerms, formatMoney, type Terms } from './flow-client'
import type { Quote } from './submit-client'

/**
 * Step 3 of the big-screen form: the price and the terms, then Submit.
 *
 * The payment terms come from the Settings through GET /place-submissions/terms,
 * never from the page. The price, its downpayment and currency are the chosen
 * layout's, snapshotted when the submission started (`quote`, from the start
 * answer) and shown over the Settings price; without a quote (an answer with
 * no usable price) the Settings price stands. This step only SHOWS them:
 * nothing is paid in the form. The two-stage payment (spec v4): the
 * downpayment by Whish within its days keeps the page number, and is returned
 * if the business is not accepted; the rest is due within its days of
 * acceptance. The checkbox is required, and Submit is held until the fresh bot
 * check (`turnstile`, drawn by the parent) has a token, when there is one to
 * wait for.
 */

/** The price minus the downpayment, counted in cents like the payment engine. */
const restOf = (terms: Terms) =>
  Math.max(0, Math.round(terms.price * 100) - Math.round(terms.downpaymentAmount * 100)) / 100

/** The values the payment sentences interpolate, money already in the page language. */
const paymentValues = (terms: Terms, locale: string) => ({
  percent: terms.downpaymentPercent,
  downpayment: formatMoney(terms.downpaymentAmount, terms.currency, locale),
  rest: formatMoney(restOf(terms), terms.currency, locale),
  downpaymentDays: terms.downpaymentDeadlineDays,
  balanceDays: terms.balanceDeadlineDays,
})

const CHECK = 'accent-cedar-900 size-4 shrink-0'

export function TermsStep({
  locale,
  quote = null,
  sessionToken = null,
  busy,
  problem,
  canSubmit,
  turnstile,
  onSubmit,
}: {
  locale: string
  /** The chosen layout's price from the start answer. */
  quote?: Quote | null
  /** The started form's token, so the terms answer with its draft's own price. */
  sessionToken?: string | null
  busy: boolean
  problem: string | null
  /** False while the bot check has not produced its token yet. */
  canSubmit: boolean
  turnstile: React.ReactNode
  onSubmit: () => void
}) {
  const t = useTranslations('magazinePlaces')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [settingsTerms, setTerms] = useState<Terms | null>(null)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    let current = true
    void fetchTerms(fetch, sessionToken).then((result) => {
      if (!current) return
      setFailed(result === null)
      setTerms(result)
    })
    return () => {
      current = false
    }
  }, [reload, sessionToken])

  const retry = useCallback(() => {
    setFailed(false)
    setReload((n) => n + 1)
  }, [])

  const terms: Terms | null =
    settingsTerms && quote
      ? {
          ...settingsTerms,
          price: quote.price,
          downpaymentAmount: quote.downpaymentAmount,
          currency: quote.currency,
        }
      : settingsTerms

  const amount = terms ? formatMoney(terms.price, terms.currency, locale) : ''

  return (
    <section className="flex flex-col gap-6" aria-labelledby="place-step-terms">
      <h3
        id="place-step-terms"
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-ink-900 text-xl focus:outline-none"
      >
        {t('flow.termsTitle')}
      </h3>

      {terms === null && !failed ? (
        <p className="text-ink-500 text-sm" role="status">
          {t('flow.termsLoading')}
        </p>
      ) : null}

      {failed ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-state-danger text-sm" role="alert">
            {t('flow.termsError')}
          </p>
          <button type="button" className={SECONDARY_BUTTON} onClick={retry}>
            {t('numbers.retry')}
          </button>
        </div>
      ) : null}

      {terms ? (
        <>
          <div className={NOTICE_INFO}>
            <p data-price className="font-display text-ink-900 text-2xl">
              {t('flow.price', { amount })}
            </p>
            <p className="mt-2">{t('flow.termLine', paymentValues(terms, locale))}</p>
          </div>

          <div>
            <p className="text-ink-900 text-sm font-semibold">{t('flow.includesTitle')}</p>
            <ul className="text-ink-700 mt-2 list-disc ps-5 text-sm">
              <li>{t('flow.includeMagazine')}</li>
              <li>{t('flow.includeListing')}</li>
              <li>{t('flow.includeQr')}</li>
            </ul>
          </div>

          <p data-payment-terms className="text-ink-900 text-sm font-semibold">
            {t('flow.payOnlyIf', paymentValues(terms, locale))}
          </p>

          <label className="text-ink-900 flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="acceptTerms"
              required
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className={CHECK}
            />
            {t('flow.accept')}
          </label>
        </>
      ) : null}

      {turnstile}

      {problem ? (
        <p className={NOTICE_ERROR} role="alert">
          {problem}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <div>
          <button
            type="button"
            className={PRIMARY_BUTTON}
            disabled={!terms || !accepted || busy || !canSubmit}
            onClick={onSubmit}
          >
            {busy ? t('form.sending') : t('flow.submit')}
          </button>
        </div>
        {terms && !accepted ? <p className={HINT}>{t('flow.termsNotAccepted')}</p> : null}
      </div>
    </section>
  )
}
