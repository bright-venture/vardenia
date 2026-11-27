'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { dirFor, type Locale } from '@vardenia/i18n'
import { PAGE_LAYOUTS, type PageLayout } from '@vardenia/core/page-layouts'
import { PAGE_TEMPLATES } from '@vardenia/core/place-submission'
import { submittableKindsByCategory } from '@vardenia/core/taxonomy'
import { categoryLabel, cityLabel, governorateLabel, subcategoryLabel } from '../../lib/labels'
import { Turnstile, isTurnstileEnabled, type TurnstileHandle } from '../Turnstile'
import {
  ERROR_TEXT,
  HINT,
  INPUT,
  INPUT_ERROR,
  LABEL,
  NOTICE_ERROR,
  NOTICE_INFO,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from '../formStyles'
import { BusinessPagePreview } from './BusinessPagePreview'
import { formatMoney, postFinish, type FinishResult } from './flow-client'
import {
  checkSubmission,
  citiesFor,
  errorKind,
  GOVERNORATE_ORDER,
  initialFormState,
  normaliseErrors,
  previewDataFrom,
  withGovernorate,
  type FormState,
  type NumberPick,
} from './form-model'
import { NumberPicker } from './NumberPicker'
import { PhoneStep } from './PhoneStep'
import { DESCRIPTION_MAX, NAME_MAX, TAGLINE_MAX, type PreviewLabels } from './preview-model'
import { postSubmission, type Quote, type SubmitResult } from './submit-client'
import { TermsStep } from './TermsStep'
import { ThanksStep } from './ThanksStep'
import { useKioskIdle } from './use-kiosk-idle'
import { issuesForLayout, layoutPrice, usePlaceNumbers } from './use-place-numbers'

/**
 * "Add your place" on /magazine-places: a business owner lays out their page in
 * the printed magazine, picks its number, adds the logo and main photo from
 * their phone, and sends it for review. Four steps on the big screen:
 *
 *   1 details      the fields, the layout (how much of the magazine) and a free
 *                  slot of it; "Next" starts the submission
 *   2 phone upload a QR code for the phone, live ticks as the photos arrive
 *   3 price/terms  the price and the terms, "Submit" finishes it
 *   4 thank you    clears itself after a minute
 *
 * The preview shares the fields’ state on step 1 and redraws from the form state
 * as the owner types; it shows placeholders where the photos go, because the
 * photos come from the phone later. Nothing is public until staff accept.
 *
 * # The session lives in memory only
 *
 * `session` (the token and the phone link) is React state: never localStorage,
 * sessionStorage, the URL or a log. This screen is shared, so `reset` clears
 * EVERYTHING (the fields, the number, the session, the reference) on "Start a
 * new one", after the thank-you, when the session expires, and when the
 * kiosk has been idle (use-kiosk-idle). Nothing about the owner is left in the
 * DOM afterwards.
 *
 * The client check runs the same schema the route runs, so most mistakes are
 * shown next to their input before anything is sent. The route stays the
 * judge: its field errors come back through the same path, and its other
 * refusals become a sentence in the page language (submit-client). The owner's
 * input is never cleared by an error.
 *
 * # Two Turnstile tokens
 *
 * A token works once. Step 1 uses one for "Next" and the widget is reset
 * afterwards; step 3 draws its own widget and "Submit" uses that fresh token.
 */

type Step = 1 | 2 | 3 | 4 | 'expired'

interface Session {
  token: string
  uploadUrl: string
  /** The chosen layout's price, snapshotted at the start; shown on step 3. */
  quote: Quote | null
}

const templateKey = { a: 'A', b: 'B', c: 'C' } as const

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500'

const CHECK = 'accent-cedar-900 size-4 shrink-0'

export function PlaceSubmissionForm({ locale }: { locale: Locale }) {
  const t = useTranslations('magazinePlaces')
  const ids = useId()
  const fid = (key: string) => `${ids}-${key}`

  const [step, setStep] = useState<Step>(1)
  const [session, setSession] = useState<Session | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  const [state, setState] = useState<FormState>(initialFormState)
  const [pick, setPick] = useState<NumberPick | null>(null)
  /** Raw schema messages, keyed by input; translated when shown. */
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [finishProblem, setFinishProblem] = useState<string | null>(null)
  const [numberNotice, setNumberNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  const turnstile = useRef<TurnstileHandle | null>(null)
  const submitting = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)
  /** Bumped by every reset: an answer that arrives for an older generation is dropped. */
  const generation = useRef(0)
  const stayRef = useRef<HTMLButtonElement>(null)

  const numbers = usePlaceNumbers(state.governorate, state.city)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])

  /** Forget everything: the owner's details, the number and the session token. */
  const reset = useCallback(() => {
    generation.current += 1
    turnstile.current?.reset()
    setState(initialFormState())
    setPick(null)
    setErrors({})
    setProblem(null)
    setFinishProblem(null)
    setNumberNotice(null)
    setSession(null)
    setReference(null)
    setTurnstileToken(null)
    setBusy(false)
    submitting.current = false
    setStep(1)
  }, [])

  /** The session ended (expired, closed, or unknown): the token is useless now. */
  const expire = useCallback(() => {
    generation.current += 1
    setSession(null)
    setStep('expired')
  }, [])

  const idle = useKioskIdle({
    active: step === 1 || step === 2 || step === 3,
    onExpire: reset,
  })

  const warningShown = idle.secondsLeft !== null
  useEffect(() => {
    if (warningShown) stayRef.current?.focus()
  }, [warningShown])

  const set = (patch: Partial<FormState>) => setState((current) => ({ ...current, ...patch }))

  function choose(issueId: number, n: number) {
    setPick({ issue: issueId, number: n })
    setNumberNotice(null)
    setErrors((current) => {
      const next = { ...current }
      delete next.number
      return next
    })
  }

  /** A new layout offers other slots: the number picked for the old one goes. */
  function chooseLayout(layout: PageLayout) {
    if (layout === state.layout) return
    setPick(null)
    setNumberNotice(null)
    set({ layout })
    setErrors((current) => {
      const next = { ...current }
      delete next.layout
      delete next.number
      return next
    })
  }

  function message(key: string): string | null {
    const raw = errors[key]
    return raw ? t(`errors.${errorKind(raw)}`) : null
  }

  function failure(result: Exclude<SubmitResult, { kind: 'ok' | 'field-errors' }>): string {
    switch (result.kind) {
      case 'number-taken':
        return t('numbers.justTaken')
      case 'no-range':
        return t('errors.noRange')
      case 'too-large':
        return t('errors.tooLarge')
      case 'rate-limited':
        return t('errors.rateLimited')
      case 'too-many-open':
        return t('flow.tooManyOpen')
      case 'turnstile':
        return t('errors.botCheck')
      case 'invalid':
        return t('errors.rejected')
      case 'network':
        return t('errors.network')
      default:
        return t('errors.generic')
    }
  }

  /** Step 1 "Next": start the submission, keep the session in memory. */
  async function next(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    setProblem(null)

    const checked = checkSubmission(state, pick, locale)
    if (!checked.ok) {
      setErrors(checked.errors)
      setProblem(t('errors.check'))
      return
    }
    setErrors({})
    if (!pick) return

    submitting.current = true
    setBusy(true)
    const mine = generation.current
    try {
      const result = await postSubmission({ data: checked.data, turnstileToken })
      if (!mounted.current || mine !== generation.current) return
      // A Turnstile token is single use, and the route checks it before
      // anything else, so every answer needs a fresh one (step 3 draws its own).
      turnstile.current?.reset()
      if (result.kind === 'ok') {
        setSession({
          token: result.sessionToken,
          uploadUrl: result.uploadUrl,
          quote: result.quote ?? null,
        })
        setReference(result.reference)
        setStep(2)
        return
      }
      if (result.kind === 'field-errors') {
        setErrors(normaliseErrors(result.errors))
        setProblem(t('errors.check'))
        return
      }
      if (result.kind === 'number-taken' || result.kind === 'no-range') {
        setPick(null)
        numbers.reload()
        if (result.kind === 'number-taken') setNumberNotice(t('numbers.justTaken'))
      }
      setProblem(failure(result))
    } finally {
      if (mine === generation.current) {
        submitting.current = false
        if (mounted.current) setBusy(false)
      }
    }
  }

  function finishFailure(result: Exclude<FinishResult, { kind: 'ok' | 'gone' }>): string {
    switch (result.kind) {
      case 'terms-not-accepted':
        return t('flow.termsNotAccepted')
      case 'photos-missing':
        return t('flow.photosMissing')
      case 'turnstile':
        return t('errors.botCheck')
      case 'rate-limited':
        return t('errors.rateLimited')
      case 'network':
        return t('errors.network')
      default:
        return t('errors.generic')
    }
  }

  /** Step 3 "Submit": finish with a FRESH Turnstile token. */
  async function finish() {
    if (submitting.current || !session) return
    setFinishProblem(null)
    submitting.current = true
    setBusy(true)
    const mine = generation.current
    try {
      const result = await postFinish({
        token: session.token,
        turnstileToken,
        locale,
      })
      if (!mounted.current || mine !== generation.current) return
      if (result.kind === 'ok') {
        // The token is spent: drop it with the rest of the session.
        setSession(null)
        setReference(result.reference)
        setStep(4)
        return
      }
      turnstile.current?.reset()
      if (result.kind === 'gone') {
        expire()
        return
      }
      if (result.kind === 'photos-missing') setStep(2)
      setFinishProblem(finishFailure(result))
    } finally {
      if (mine === generation.current) {
        submitting.current = false
        if (mounted.current) setBusy(false)
      }
    }
  }

  function showPreview() {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    previewRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    previewRef.current?.focus({ preventScroll: true })
  }

  const dir = dirFor(locale)

  const warning =
    idle.secondsLeft !== null ? (
      <div
        role="alertdialog"
        aria-labelledby={fid('idle-title')}
        aria-describedby={fid('idle-body')}
        className={`${NOTICE_INFO} fixed inset-x-4 top-4 z-50 flex flex-wrap items-center justify-between gap-3 shadow-lg`}
      >
        <div>
          <p id={fid('idle-title')} className="text-ink-900 font-semibold">
            {t('flow.idleTitle')}
          </p>
          <p id={fid('idle-body')}>{t('flow.idleBody', { seconds: idle.secondsLeft })}</p>
        </div>
        <button ref={stayRef} type="button" className={PRIMARY_BUTTON} onClick={idle.stay}>
          {t('flow.idleStay')}
        </button>
      </div>
    ) : null

  const progress =
    typeof step === 'number' ? (
      <p className="text-ink-500 text-xs font-semibold uppercase tracking-wider" data-step={step}>
        {t('flow.progress', { n: step, total: 4 })}
      </p>
    ) : null

  if (step !== 1) {
    return (
      <div data-place-form dir={dir} lang={locale} className="mt-4 flex flex-col gap-6">
        {warning}
        {progress}
        {step === 2 && session ? (
          <PhoneStep
            token={session.token}
            uploadUrl={session.uploadUrl}
            problem={finishProblem}
            onContinue={() => {
              setFinishProblem(null)
              setStep(3)
            }}
            onGone={expire}
            onActivity={idle.stay}
          />
        ) : null}
        {step === 3 ? (
          <TermsStep
            locale={locale}
            quote={session?.quote ?? null}
            sessionToken={session?.token ?? null}
            busy={busy}
            problem={finishProblem}
            canSubmit={!isTurnstileEnabled() || turnstileToken !== null}
            turnstile={
              /* Renders nothing until a site key is set. See components/Turnstile. */
              <Turnstile onToken={setTurnstileToken} handle={turnstile} locale={locale} />
            }
            onSubmit={() => void finish()}
          />
        ) : null}
        {step === 4 && reference ? <ThanksStep reference={reference} onDone={reset} /> : null}
        {step === 'expired' ? (
          <div className="flex flex-col gap-4">
            <p className={NOTICE_ERROR} role="alert">
              {t('flow.expired')}
            </p>
            <div>
              <button type="button" className={PRIMARY_BUTTON} onClick={reset}>
                {t('flow.startAgain')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const previewLabels: PreviewLabels = {
    name: t('form.name'),
    tagline: t('form.tagline'),
    description: t('form.description'),
    category: t('form.category'),
    governorate: t('form.governorate'),
    address: t('form.address'),
    phone: t('form.publicPhone'),
    photo: t('form.hero'),
  }
  // No photos yet: they come from the phone in step 2, so the preview shows
  // its placeholders.
  const preview = previewDataFrom(state, { galleryUrls: [], listingNumber: pick?.number }, locale)

  const canNext = Boolean(pick) && !busy

  /** Props shared by every text input, select and textarea. */
  const control = (key: string, hint = false) => {
    const error = message(key)
    const described = [hint ? `${fid(key)}-hint` : null, error ? `${fid(key)}-error` : null]
      .filter(Boolean)
      .join(' ')
    return {
      id: fid(key),
      name: key,
      'aria-invalid': Boolean(error),
      'aria-describedby': described || undefined,
      className: `${INPUT} mt-1.5 ${error ? INPUT_ERROR : ''}`,
    }
  }

  const errorLine = (key: string) => {
    const error = message(key)
    return error ? (
      <p id={`${fid(key)}-error`} className={ERROR_TEXT}>
        {error}
      </p>
    ) : null
  }

  const counter = (value: string, max: number) =>
    t('form.counter', { count: Array.from(value).length, max })

  const legend = 'font-display text-ink-900 text-xl'
  const kindGroups = submittableKindsByCategory()
  const cities = citiesFor(state.governorate)

  return (
    <div
      data-place-form
      data-listing-editor
      dir={dir}
      lang={locale}
      className="mt-4 flex flex-col gap-8"
    >
      {warning}
      <section aria-labelledby={fid('preview-title')} className="flex flex-col gap-3">
        <div>
          <h3 id={fid('preview-title')} className={legend}>
            {t('form.previewTitle')}
          </h3>
          <p className={HINT}>{t('form.previewNote')}</p>
        </div>
        <div
          ref={previewRef}
          tabIndex={-1}
          data-template={state.template}
          aria-label={t('form.previewTitle')}
          className={`mx-auto w-full max-w-sm scroll-mt-24 ${FOCUS_RING}`}
        >
          <BusinessPagePreview template={state.template} data={preview} labels={previewLabels} />
        </div>
      </section>

      {progress}

      <form ref={formRef} onSubmit={next} noValidate aria-busy={busy}>
        <p className="text-ink-700 text-sm" data-form-intro>
          {t('form.intro')}
        </p>
        {locale === 'en' && (
          <p hidden data-desktop-intro>
            Choose a layout, enter your details and pick a page number. In the next step, scan the
            code with your phone to send your logo and main photo.
          </p>
        )}

        <fieldset disabled={busy} className="m-0 mt-6 flex min-w-0 flex-col gap-10 border-0 p-0">
          {/* Layout */}
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={legend}>{t('form.templateLegend')}</legend>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {PAGE_TEMPLATES.map((key) => (
                <label
                  key={key}
                  className="border-ink-100 has-[:checked]:border-cedar-900 has-[:checked]:bg-surface-raised has-[:focus-visible]:outline-gold-500 flex cursor-pointer flex-col gap-1 border p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="pageTemplate"
                      value={key}
                      checked={state.template === key}
                      onChange={() => set({ template: key })}
                      className={CHECK}
                    />
                    <span className="text-ink-900 text-sm font-semibold">
                      {t(`form.template${templateKey[key]}`)}
                    </span>
                  </span>
                  <span className="text-ink-500 text-xs">
                    {t(`form.template${templateKey[key]}Hint`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* The business */}
          <fieldset className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
            <legend className={`${legend} mb-1`}>{t('form.businessLegend')}</legend>

            <div>
              <label className={LABEL} htmlFor={fid('name')}>
                {t('form.name')}
              </label>
              <input
                {...control('name', true)}
                type="text"
                required
                maxLength={NAME_MAX}
                autoComplete="organization"
                dir="auto"
                value={state.name}
                onChange={(e) => set({ name: e.target.value })}
              />
              <p id={`${fid('name')}-hint`} className={HINT}>
                {counter(state.name, NAME_MAX)}
              </p>
              {errorLine('name')}
            </div>

            <div>
              <label className={LABEL} htmlFor={fid('tagline')}>
                {t('form.tagline')}
              </label>
              <input
                {...control('tagline', true)}
                type="text"
                maxLength={TAGLINE_MAX}
                dir="auto"
                value={state.tagline}
                onChange={(e) => set({ tagline: e.target.value })}
              />
              <p id={`${fid('tagline')}-hint`} className={HINT}>
                {t('form.taglineHint')} {counter(state.tagline, TAGLINE_MAX)}
              </p>
              {errorLine('tagline')}
            </div>

            <div>
              <label className={LABEL} htmlFor={fid('description')}>
                {t('form.description')}
              </label>
              <textarea
                {...control('description', true)}
                rows={6}
                maxLength={DESCRIPTION_MAX}
                dir="auto"
                value={state.description}
                onChange={(e) => set({ description: e.target.value })}
              />
              <p id={`${fid('description')}-hint`} className={HINT}>
                {t('form.descriptionHint')} {counter(state.description, DESCRIPTION_MAX)}
              </p>
              {errorLine('description')}
            </div>

            <div>
              <label className={LABEL} htmlFor={fid('kind')}>
                {t('form.category')}
              </label>
              <select
                {...control('kind')}
                required
                value={state.kind}
                onChange={(e) => set({ kind: e.target.value })}
              >
                <option value="">{t('form.chooseCategory')}</option>
                {kindGroups.map(({ category, kinds }) => (
                  <optgroup key={category.slug} label={categoryLabel(category.slug, locale)}>
                    {kinds.map((kind) => (
                      <option key={kind.slug} value={kind.slug}>
                        {subcategoryLabel(kind.slug, locale)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {errorLine('kind')}
            </div>
          </fieldset>

          {/* Where */}
          <fieldset className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
            <legend className={`${legend} mb-1`}>{t('form.locationLegend')}</legend>

            <div>
              <label className={LABEL} htmlFor={fid('governorate')}>
                {t('form.governorate')}
              </label>
              <select
                {...control('governorate')}
                required
                value={state.governorate}
                onChange={(e) => {
                  const next = e.target.value
                  if (next !== state.governorate) {
                    setPick(null)
                    setNumberNotice(null)
                  }
                  setState((current) => withGovernorate(current, next))
                }}
              >
                <option value="">{t('form.chooseGovernorate')}</option>
                {GOVERNORATE_ORDER.map((slug) => (
                  <option key={slug} value={slug}>
                    {governorateLabel(slug, locale)}
                  </option>
                ))}
              </select>
              {errorLine('governorate')}
            </div>

            <div>
              <label className={LABEL} htmlFor={fid('city')}>
                {t('form.city')}
              </label>
              <select
                {...control('city')}
                required
                disabled={cities.length === 0}
                value={state.city}
                // The numbers depend on the city only when an issue for this
                // governorate is split by city: then a new city offers other
                // slots, and the number picked for the old one goes. All
                // Lebanon numbers depend on the region alone.
                onChange={(e) => {
                  const next = e.target.value
                  if (next !== state.city && numbers.needsCity) {
                    setPick(null)
                    setNumberNotice(null)
                  }
                  set({ city: next })
                }}
              >
                <option value="">{t('form.chooseCity')}</option>
                {cities.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {cityLabel(d.slug, locale)}
                  </option>
                ))}
              </select>
              {errorLine('city')}
            </div>

            <div>
              <label className={LABEL} htmlFor={fid('address')}>
                {t('form.address')}
              </label>
              <input
                {...control('address')}
                type="text"
                required
                maxLength={300}
                autoComplete="street-address"
                dir="auto"
                value={state.address}
                onChange={(e) => set({ address: e.target.value })}
              />
              {errorLine('address')}
            </div>
          </fieldset>

          {/* How much of the magazine: same radios as the page design above, text only. */}
          <fieldset
            className="m-0 min-w-0 border-0 p-0"
            aria-describedby={message('layout') ? `${fid('layout')}-error` : undefined}
          >
            <legend className={legend}>{t('form.layoutLegend')}</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PAGE_LAYOUTS.map((layout) => (
                <label
                  key={layout}
                  className="border-ink-100 has-[:checked]:border-cedar-900 has-[:checked]:bg-surface-raised has-[:focus-visible]:outline-gold-500 flex cursor-pointer items-center gap-2 border p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
                >
                  <input
                    type="radio"
                    name="layout"
                    value={layout}
                    checked={state.layout === layout}
                    onChange={() => chooseLayout(layout)}
                    className={CHECK}
                  />
                  <span className="flex flex-col">
                    <span className="text-ink-900 text-sm font-semibold">
                      {t(`form.layouts.${layout}`)}
                    </span>
                    {/* The price beside each size (PRD v7 section 9), once a region is chosen. */}
                    {(() => {
                      const price =
                        numbers.state === 'ready' ? layoutPrice(numbers.issues, layout) : null
                      if (!price) return null
                      const amount = formatMoney(price.amount, price.currency, locale)
                      return (
                        <span className="text-ink-700 text-sm">
                          {t(price.from ? 'numbers.priceFrom' : 'numbers.price', { amount })}
                        </span>
                      )
                    })()}
                  </span>
                </label>
              ))}
            </div>
            {message('layout') ? (
              <p id={`${fid('layout')}-error`} className={ERROR_TEXT}>
                {message('layout')}
              </p>
            ) : null}
          </fieldset>

          {/* The number */}
          <fieldset
            className="m-0 min-w-0 border-0 p-0"
            aria-describedby={`${fid('number')}-hint${message('number') ? ` ${fid('number')}-error` : ''}`}
          >
            <legend className={legend}>{t('numbers.legend')}</legend>
            <p id={`${fid('number')}-hint`} className={HINT}>
              {t('numbers.hint')}
            </p>
            {numberNotice ? (
              <p className={`${NOTICE_ERROR} mt-3`} role="alert">
                {numberNotice}
              </p>
            ) : null}
            <div className="mt-3" aria-live="polite">
              {numbers.state === 'idle' ? (
                <p className="text-ink-500 text-sm">
                  {t(numbers.needsCity ? 'numbers.chooseCity' : 'numbers.chooseRegion')}
                </p>
              ) : numbers.state === 'loading' ? (
                <p className="text-ink-500 text-sm" role="status">
                  {t('numbers.loading')}
                </p>
              ) : numbers.state === 'error' ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-state-danger text-sm">{t('numbers.error')}</p>
                  <button type="button" className={SECONDARY_BUTTON} onClick={numbers.reload}>
                    {t('numbers.retry')}
                  </button>
                </div>
              ) : numbers.issues.length === 0 ? (
                <p className={NOTICE_INFO} role="status">
                  {t('numbers.noRange')}
                </p>
              ) : !state.layout ? (
                <p className="text-ink-500 text-sm">{t('numbers.chooseLayout')}</p>
              ) : (
                <NumberPicker
                  issues={issuesForLayout(numbers.issues, state.layout)}
                  value={pick?.number ?? null}
                  selectedIssue={pick?.issue ?? null}
                  onChange={choose}
                />
              )}
            </div>
            {pick ? (
              <p className="text-ink-700 mt-3 text-sm">{t('numbers.chosen', { n: pick.number })}</p>
            ) : null}
            {message('number') ? (
              <p id={`${fid('number')}-error`} className={ERROR_TEXT}>
                {message('number')}
              </p>
            ) : null}
          </fieldset>

          {/* Details */}
          <fieldset className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
            <legend className={`${legend} mb-1`}>{t('form.detailsLegend')}</legend>

            <label className="text-ink-900 flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="acceptsWhish"
                checked={state.acceptsWhish}
                onChange={(e) => set({ acceptsWhish: e.target.checked })}
                className={CHECK}
              />
              {t('form.paymentWhish')}
            </label>

            <div>
              <label className={LABEL} htmlFor={fid('publicPhone')}>
                {t('form.publicPhone')}
              </label>
              <input
                {...control('publicPhone')}
                type="tel"
                dir="ltr"
                maxLength={20}
                autoComplete="tel"
                value={state.publicPhone}
                onChange={(e) => set({ publicPhone: e.target.value })}
              />
              {errorLine('publicPhone')}
            </div>

            <div>
              <label className={LABEL} htmlFor={fid('instagram')}>
                {t('form.instagram')}
              </label>
              <input
                {...control('instagram', true)}
                type="text"
                dir="ltr"
                maxLength={300}
                autoComplete="off"
                placeholder="@"
                value={state.instagram}
                onChange={(e) => set({ instagram: e.target.value })}
              />
              <p id={`${fid('instagram')}-hint`} className={HINT}>
                {t('form.instagramHint')}
              </p>
              {errorLine('instagram')}
            </div>

            <div>
              <label className={LABEL} htmlFor={fid('facebook')}>
                {t('form.facebook')}
              </label>
              <input
                {...control('facebook', true)}
                type="url"
                dir="ltr"
                maxLength={300}
                autoComplete="off"
                placeholder="https://"
                value={state.facebook}
                onChange={(e) => set({ facebook: e.target.value })}
              />
              <p id={`${fid('facebook')}-hint`} className={HINT}>
                {t('form.facebookHint')}
              </p>
              {errorLine('facebook')}
            </div>
          </fieldset>

          {/* The owner */}
          <fieldset className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
            <legend className={legend}>{t('form.ownerLegend')}</legend>
            <p className={`${HINT} -mt-4`}>{t('form.ownerHint')}</p>

            <div>
              <label className={LABEL} htmlFor={fid('ownerName')}>
                {t('form.ownerName')}
              </label>
              <input
                {...control('ownerName')}
                type="text"
                required
                maxLength={120}
                autoComplete="name"
                dir="auto"
                value={state.ownerName}
                onChange={(e) => set({ ownerName: e.target.value })}
              />
              {errorLine('ownerName')}
            </div>

            <div>
              <label className={LABEL} htmlFor={fid('ownerEmail')}>
                {t('form.ownerEmail')}
              </label>
              <input
                {...control('ownerEmail')}
                type="email"
                required
                dir="ltr"
                maxLength={254}
                autoComplete="email"
                value={state.ownerEmail}
                onChange={(e) => set({ ownerEmail: e.target.value })}
              />
              {errorLine('ownerEmail')}
            </div>

            <div>
              <label className={LABEL} htmlFor={fid('ownerPhone')}>
                {t('form.ownerPhone')}
              </label>
              <input
                {...control('ownerPhone')}
                type="tel"
                required
                dir="ltr"
                maxLength={40}
                autoComplete="tel"
                value={state.ownerPhone}
                onChange={(e) => set({ ownerPhone: e.target.value })}
              />
              {errorLine('ownerPhone')}
            </div>
          </fieldset>

          {/* Renders nothing until a site key is set. See components/Turnstile. */}
          <Turnstile onToken={setTurnstileToken} handle={turnstile} locale={locale} />

          <div className="flex flex-col gap-3">
            {/* Next to the button, where the owner is looking when it answers. */}
            {problem ? (
              <p className={NOTICE_ERROR} role="alert">
                {problem}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button type="button" className={SECONDARY_BUTTON} onClick={showPreview}>
                {t('form.previewButton')}
              </button>
              <button
                type="submit"
                disabled={!canNext}
                aria-describedby={canNext ? undefined : fid('next-needs')}
                className={PRIMARY_BUTTON}
              >
                {busy ? t('form.sending') : t('flow.next')}
              </button>
            </div>
            {!pick ? (
              <p id={fid('next-needs')} className={HINT}>
                {t('flow.nextNeeds')}
              </p>
            ) : null}
          </div>
        </fieldset>
      </form>
    </div>
  )
}
