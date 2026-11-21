'use client'

/* eslint-disable @next/next/no-img-element -- thumbnails of browser object URLs (blob:), which next/image cannot load */

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { dirFor, taxonomyLabel, type Locale } from '@vardenia/i18n'
import { AMENITIES, PRICE_RANGES } from '@vardenia/core/attributes'
import { PAGE_TEMPLATES } from '@vardenia/core/place-submission'
import { CATEGORIES } from '@vardenia/core/taxonomy'
import type { DayKey } from '../../lib/hours'
import {
  amenityLabel,
  categoryLabel,
  districtLabel,
  governorateLabel,
  subcategoryLabel,
} from '../../lib/labels'
import { Turnstile, type TurnstileHandle } from '../Turnstile'
import {
  ERROR_TEXT,
  HINT,
  INPUT,
  INPUT_ERROR,
  LABEL,
  NOTICE_ERROR,
  NOTICE_SUCCESS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from '../formStyles'
import { BusinessPagePreview } from './BusinessPagePreview'
import {
  checkSubmission,
  districtsFor,
  errorKind,
  GOVERNORATE_ORDER,
  initialFormState,
  normaliseErrors,
  PAYMENT_KEYS,
  previewDataFrom,
  subcategoriesFor,
  toggle,
  withCategory,
  withGovernorate,
  type FormState,
  type NumberPick,
} from './form-model'
import { NumberPicker } from './NumberPicker'
import {
  MAX_GALLERY_PHOTOS,
  PHOTO_ACCEPT,
  PhotoError,
  isAcceptedPhoto,
  preparePhoto,
  withinBudget,
} from './photos'
import { DESCRIPTION_MAX, NAME_MAX, TAGLINE_MAX, type PreviewLabels } from './preview-model'
import { postSubmission, type SubmitResult } from './submit-client'
import { usePlaceNumbers } from './use-place-numbers'

/**
 * "Add your place" on /magazine-places: a business owner lays out their page in
 * the printed magazine, picks its number, and sends it for review.
 *
 * The preview sits above the fields and redraws from the form state as the
 * owner types; photos are shown from local object URLs. Nothing is saved until
 * Submit, which creates a draft the team reviews (app/place-submissions).
 *
 * The client check runs the same schema the route runs, so most mistakes are
 * shown next to their input before anything is uploaded. The route stays the
 * judge: its field errors come back through the same path, and its other
 * refusals become a sentence in the page language (submit-client). The owner's
 * input is never cleared by an error.
 */

type PhotoSlot = 'hero' | 'gallery' | 'logo'

interface Photo {
  file: File
  url: string
}

interface Photos {
  hero: Photo | null
  gallery: Photo[]
  logo: Photo | null
}

const NO_PHOTOS: Photos = { hero: null, gallery: [], logo: null }

const urlsOf = (photos: Photos) =>
  [photos.hero, ...photos.gallery, photos.logo].flatMap((photo) => (photo ? [photo.url] : []))

const templateKey = { a: 'A', b: 'B', c: 'C' } as const

/** Price bands in words (no symbols: the site shows no prices). */
const priceLabel = (entry: (typeof PRICE_RANGES)[number], locale: Locale) =>
  locale === 'ar'
    ? entry.ar
    : locale === 'en'
      ? entry.en
      : (taxonomyLabel(entry.slug, locale) ?? entry.en)

const PAYMENT_LABEL = {
  cash: 'paymentCash',
  card: 'paymentCard',
  whish: 'paymentWhish',
  omt: 'paymentOmt',
} as const satisfies Record<(typeof PAYMENT_KEYS)[number], string>

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500'

const CHECK = 'accent-cedar-900 size-4 shrink-0'

export function PlaceSubmissionForm({ locale }: { locale: Locale }) {
  const t = useTranslations('magazinePlaces')
  const days = useTranslations('days')
  const ids = useId()
  const fid = (key: string) => `${ids}-${key}`

  const [state, setState] = useState<FormState>(initialFormState)
  const [pick, setPick] = useState<NumberPick | null>(null)
  const [photos, setPhotos] = useState<Photos>(NO_PHOTOS)
  const [preparing, setPreparing] = useState(0)
  const [photoErrors, setPhotoErrors] = useState<Partial<Record<PhotoSlot, string>>>({})
  /** Raw schema messages, keyed by input; translated when shown. */
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [numberNotice, setNumberNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  const turnstile = useRef<TurnstileHandle | null>(null)
  const submitting = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLDivElement>(null)
  /**
   * The photos whose object URLs are alive. Mirrors `photos` so a replaced or
   * removed photo can be revoked at once, and everything on unmount; `mounted`
   * stops a photo that finishes preparing after unmount from leaking a URL.
   */
  const livePhotos = useRef<Photos>(NO_PHOTOS)
  const mounted = useRef(false)

  const numbers = usePlaceNumbers(state.governorate)

  useEffect(() => {
    mounted.current = true
    const live = livePhotos
    return () => {
      mounted.current = false
      for (const url of urlsOf(live.current)) URL.revokeObjectURL(url)
      live.current = NO_PHOTOS
    }
  }, [])

  useEffect(() => {
    if (sentTo) successRef.current?.focus()
  }, [sentTo])

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])

  function commitPhotos(update: (current: Photos) => Photos) {
    const previous = livePhotos.current
    const next = update(previous)
    livePhotos.current = next
    setPhotos(next)
    const kept = new Set(urlsOf(next))
    for (const url of urlsOf(previous)) if (!kept.has(url)) URL.revokeObjectURL(url)
  }

  const set = (patch: Partial<FormState>) => setState((current) => ({ ...current, ...patch }))

  async function addPhotos(slot: PhotoSlot, chosen: File[]) {
    if (chosen.length === 0) return
    setPhotoErrors((current) => ({ ...current, [slot]: undefined }))

    const room = slot === 'gallery' ? MAX_GALLERY_PHOTOS - livePhotos.current.gallery.length : 1
    if (room <= 0) {
      setPhotoErrors((current) => ({
        ...current,
        gallery: t('errors.galleryFull', { max: MAX_GALLERY_PHOTOS }),
      }))
      return
    }
    const files = chosen.slice(0, room)
    if (files.some((file) => !isAcceptedPhoto(file))) {
      setPhotoErrors((current) => ({ ...current, [slot]: t('errors.photoType') }))
      return
    }

    setPreparing((n) => n + 1)
    let ready: File[]
    try {
      ready = await Promise.all(files.map((file) => preparePhoto(file)))
    } catch (error) {
      if (mounted.current) {
        const kind =
          error instanceof PhotoError && error.problem === 'type' ? 'photoType' : 'photoFailed'
        setPhotoErrors((current) => ({ ...current, [slot]: t(`errors.${kind}`) }))
      }
      return
    } finally {
      if (mounted.current) setPreparing((n) => n - 1)
    }
    if (!mounted.current) return

    const made = ready.map((file) => ({ file, url: URL.createObjectURL(file) }))
    commitPhotos((current) =>
      slot === 'gallery'
        ? { ...current, gallery: [...current.gallery, ...made].slice(0, MAX_GALLERY_PHOTOS) }
        : { ...current, [slot]: made[0] ?? null },
    )
    if (chosen.length > room) {
      setPhotoErrors((current) => ({
        ...current,
        gallery: t('errors.galleryFull', { max: MAX_GALLERY_PHOTOS }),
      }))
    }
  }

  function onPhotoInput(slot: PhotoSlot, event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : []
    // Cleared so choosing the same file again still fires a change.
    event.target.value = ''
    void addPhotos(slot, files)
  }

  function choose(issueId: number, n: number) {
    setPick({ issue: issueId, number: n })
    setNumberNotice(null)
    setErrors((current) => {
      const next = { ...current }
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
      case 'turnstile':
        return t('errors.botCheck')
      case 'photos':
        return t('errors.photos')
      case 'invalid':
        return t('errors.rejected')
      case 'network':
        return t('errors.network')
      default:
        return t('errors.generic')
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
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
    const current = livePhotos.current
    if (!current.hero || !pick) return
    const files = [current.hero.file, ...current.gallery.map((p) => p.file)]
    if (current.logo) files.push(current.logo.file)
    if (!withinBudget(files)) {
      setProblem(t('errors.tooLarge'))
      return
    }

    submitting.current = true
    setBusy(true)
    try {
      const result = await postSubmission({
        data: checked.data,
        hero: current.hero.file,
        gallery: current.gallery.map((p) => p.file),
        logo: current.logo?.file ?? null,
        turnstileToken,
      })
      if (!mounted.current) return
      if (result.kind === 'ok') {
        setSentTo(state.ownerEmail.trim())
        return
      }
      // A Turnstile token is single use, and the route checks it before
      // anything else, so every refusal needs a fresh one.
      turnstile.current?.reset()
      if (result.kind === 'field-errors') {
        setErrors(normaliseErrors(result.errors, checked.hourDays))
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
      submitting.current = false
      if (mounted.current) setBusy(false)
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
  const dayName = (day: DayKey) => days(day)

  if (sentTo !== null) {
    return (
      <div data-place-form dir={dir} lang={locale} className="mt-4">
        <div
          ref={successRef}
          tabIndex={-1}
          role="status"
          className={`${NOTICE_SUCCESS} ${FOCUS_RING}`}
        >
          <p className="font-semibold">{t('form.successTitle')}</p>
          <p className="mt-2">{t('form.success', { email: sentTo })}</p>
        </div>
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
    hours: t('form.hoursLegend'),
    phone: t('form.publicPhone'),
    amenities: t('form.amenities'),
    photo: t('form.hero'),
  }
  const preview = previewDataFrom(
    state,
    {
      heroUrl: photos.hero?.url,
      galleryUrls: photos.gallery.map((p) => p.url),
      logoUrl: photos.logo?.url,
      listingNumber: pick?.number,
    },
    locale,
    dayName,
  )

  const canSubmit = Boolean(pick && photos.hero) && !busy && preparing === 0

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
  const subcategories = subcategoriesFor(state.category)
  const districts = districtsFor(state.governorate)

  return (
    <div data-place-form dir={dir} lang={locale} className="mt-4 flex flex-col gap-8">
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

      <form ref={formRef} onSubmit={submit} noValidate aria-busy={busy}>
        <p className="text-ink-700 text-sm">{t('form.intro')}</p>

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
              <label className={LABEL} htmlFor={fid('category')}>
                {t('form.category')}
              </label>
              <select
                {...control('category')}
                required
                value={state.category}
                onChange={(e) => setState((current) => withCategory(current, e.target.value))}
              >
                <option value="">{t('form.chooseCategory')}</option>
                {CATEGORIES.filter((c) => !c.retired).map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {categoryLabel(c.slug, locale)}
                  </option>
                ))}
              </select>
              {errorLine('category')}
            </div>

            <fieldset
              className="m-0 min-w-0 border-0 p-0"
              aria-describedby={
                message('subcategories') ? `${fid('subcategories')}-error` : undefined
              }
            >
              <legend className={LABEL}>{t('form.subcategories')}</legend>
              {subcategories.length === 0 ? (
                <p className={HINT}>{t('form.subcategoriesHint')}</p>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {subcategories.map((sub) => (
                    <label
                      key={sub.slug}
                      className="text-ink-900 flex min-h-11 items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="subcategories"
                        value={sub.slug}
                        checked={state.subcategories.includes(sub.slug)}
                        onChange={() =>
                          set({ subcategories: toggle(state.subcategories, sub.slug) })
                        }
                        className={CHECK}
                      />
                      {subcategoryLabel(sub.slug, locale)}
                    </label>
                  ))}
                </div>
              )}
              {errorLine('subcategories')}
            </fieldset>
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
              <label className={LABEL} htmlFor={fid('district')}>
                {t('form.district')}
              </label>
              <select
                {...control('district')}
                disabled={districts.length === 0}
                value={state.district}
                onChange={(e) => set({ district: e.target.value })}
              >
                <option value="">{t('form.noDistrict')}</option>
                {districts.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {districtLabel(d.slug, locale)}
                  </option>
                ))}
              </select>
              {errorLine('district')}
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
                <p className="text-ink-500 text-sm">{t('numbers.chooseRegion')}</p>
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
              ) : (
                <NumberPicker
                  issues={numbers.issues}
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

          {/* Hours */}
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={legend}>{t('form.hoursLegend')}</legend>
            <p className={HINT}>{t('form.hoursHint')}</p>
            <div className="mt-3 flex flex-col gap-3">
              {state.hours.map((row, index) => {
                const update = (patch: Partial<typeof row>) =>
                  setState((current) => ({
                    ...current,
                    hours: current.hours.map((r, i) => (i === index ? { ...r, ...patch } : r)),
                  }))
                const opensKey = `hours.${row.day}.opens`
                const closesKey = `hours.${row.day}.closes`
                const rowError = message(opensKey) ?? message(closesKey)
                return (
                  <div key={row.day}>
                    <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[7rem_1fr_1fr_auto]">
                      <p className="text-ink-900 col-span-3 text-sm font-semibold sm:col-span-1 sm:self-center">
                        {dayName(row.day)}
                      </p>
                      <input
                        {...control(opensKey)}
                        type="time"
                        dir="ltr"
                        aria-label={`${dayName(row.day)}: ${t('form.opens')}`}
                        aria-describedby={rowError ? `${fid(row.day)}-hours-error` : undefined}
                        disabled={row.closed}
                        value={row.opens}
                        onChange={(e) => update({ opens: e.target.value })}
                      />
                      <input
                        {...control(closesKey)}
                        type="time"
                        dir="ltr"
                        aria-label={`${dayName(row.day)}: ${t('form.closes')}`}
                        aria-describedby={rowError ? `${fid(row.day)}-hours-error` : undefined}
                        disabled={row.closed}
                        value={row.closes}
                        onChange={(e) => update({ closes: e.target.value })}
                      />
                      <label className="text-ink-900 flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={row.closed}
                          onChange={(e) => update({ closed: e.target.checked })}
                          className={CHECK}
                        />
                        {t('form.closed')}
                      </label>
                    </div>
                    {rowError ? (
                      <p id={`${fid(row.day)}-hours-error`} className={ERROR_TEXT}>
                        {rowError}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>
            {errorLine('hours')}
          </fieldset>

          {/* Details */}
          <fieldset className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
            <legend className={`${legend} mb-1`}>{t('form.detailsLegend')}</legend>

            <div>
              <label className={LABEL} htmlFor={fid('priceRange')}>
                {t('form.priceRange')}
              </label>
              <select
                {...control('priceRange')}
                value={state.priceRange}
                onChange={(e) => set({ priceRange: e.target.value })}
              >
                <option value="">{t('form.noPriceRange')}</option>
                {PRICE_RANGES.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {priceLabel(p, locale)}
                  </option>
                ))}
              </select>
              {errorLine('priceRange')}
            </div>

            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className={LABEL}>{t('form.amenities')}</legend>
              <div className="mt-2 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                {AMENITIES.map((a) => (
                  <label
                    key={a.slug}
                    className="text-ink-900 flex min-h-11 items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="amenities"
                      value={a.slug}
                      checked={state.amenities.includes(a.slug)}
                      onChange={() => set({ amenities: toggle(state.amenities, a.slug) })}
                      className={CHECK}
                    />
                    {amenityLabel(a.slug, locale)}
                  </label>
                ))}
              </div>
              {errorLine('amenities')}
            </fieldset>

            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className={LABEL}>{t('form.payments')}</legend>
              <div className="mt-2 grid grid-cols-2 gap-x-4">
                {PAYMENT_KEYS.map((key) => (
                  <label
                    key={key}
                    className="text-ink-900 flex min-h-11 items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name={`payments.${key}`}
                      checked={state.payments[key]}
                      onChange={(e) =>
                        set({ payments: { ...state.payments, [key]: e.target.checked } })
                      }
                      className={CHECK}
                    />
                    {t(`form.${PAYMENT_LABEL[key]}`)}
                  </label>
                ))}
              </div>
            </fieldset>

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

          {/* Photos */}
          <fieldset className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
            <legend className={legend}>{t('form.photosLegend')}</legend>
            <p className={`${HINT} -mt-4`}>{t('form.photosHint')}</p>

            <PhotoInput
              id={fid('hero')}
              name="hero"
              label={t('form.hero')}
              hint={t('form.heroHint')}
              error={photoErrors.hero}
              onChange={(event) => onPhotoInput('hero', event)}
            >
              {photos.hero ? <Thumb photo={photos.hero} /> : null}
            </PhotoInput>

            <PhotoInput
              id={fid('gallery')}
              name="gallery"
              multiple
              label={t('form.gallery')}
              hint={t('form.galleryHint', {
                max: MAX_GALLERY_PHOTOS,
                count: photos.gallery.length,
              })}
              error={photoErrors.gallery}
              disabled={photos.gallery.length >= MAX_GALLERY_PHOTOS}
              onChange={(event) => onPhotoInput('gallery', event)}
            >
              {photos.gallery.length > 0 ? (
                <ul className="mt-3 grid grid-cols-3 gap-2">
                  {photos.gallery.map((photo, index) => (
                    <li key={photo.url} className="flex flex-col gap-1">
                      <Thumb photo={photo} />
                      <button
                        type="button"
                        className={`text-ink-700 hover:text-ink-900 min-h-11 text-sm underline underline-offset-4 ${FOCUS_RING}`}
                        aria-label={t('form.removeGalleryPhoto', { n: index + 1 })}
                        onClick={() =>
                          commitPhotos((current) => ({
                            ...current,
                            gallery: current.gallery.filter((p) => p.url !== photo.url),
                          }))
                        }
                      >
                        {t('form.removePhoto')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </PhotoInput>

            <PhotoInput
              id={fid('logo')}
              name="logo"
              label={t('form.logo')}
              hint={t('form.logoHint')}
              error={photoErrors.logo}
              onChange={(event) => onPhotoInput('logo', event)}
            >
              {photos.logo ? (
                <div className="mt-3 flex items-center gap-3">
                  <Thumb photo={photos.logo} />
                  <button
                    type="button"
                    className={`text-ink-700 hover:text-ink-900 min-h-11 text-sm underline underline-offset-4 ${FOCUS_RING}`}
                    onClick={() => commitPhotos((current) => ({ ...current, logo: null }))}
                  >
                    {t('form.removePhoto')}
                  </button>
                </div>
              ) : null}
            </PhotoInput>

            {preparing > 0 ? (
              <p className="text-ink-500 text-sm" role="status">
                {t('form.preparing')}
              </p>
            ) : null}
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
                disabled={!canSubmit}
                aria-describedby={canSubmit ? undefined : fid('submit-needs')}
                className={PRIMARY_BUTTON}
              >
                {busy ? t('form.sending') : t('form.submit')}
              </button>
            </div>
            {!pick || !photos.hero ? (
              <p id={fid('submit-needs')} className={HINT}>
                {t('form.submitNeeds')}
              </p>
            ) : null}
          </div>
        </fieldset>
      </form>
    </div>
  )
}

function PhotoInput({
  id,
  name,
  label,
  hint,
  error,
  multiple = false,
  disabled = false,
  onChange,
  children,
}: {
  id: string
  name: string
  label: string
  hint: string
  error?: string
  multiple?: boolean
  disabled?: boolean
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  children?: React.ReactNode
}) {
  return (
    <div>
      <label className={LABEL} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple={multiple}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        onChange={onChange}
        className="text-ink-700 file:bg-cedar-900 file:text-surface-base hover:file:bg-cedar-700 mt-1.5 block w-full text-sm file:me-3 file:min-h-11 file:cursor-pointer file:border-0 file:px-4 file:text-sm file:font-semibold disabled:opacity-60"
      />
      <p id={`${id}-hint`} className={HINT}>
        {hint}
      </p>
      {error ? (
        <p id={`${id}-error`} className={ERROR_TEXT} role="alert">
          {error}
        </p>
      ) : null}
      {children}
    </div>
  )
}

function Thumb({ photo }: { photo: Photo }) {
  return (
    <img
      src={photo.url}
      alt=""
      className="border-ink-100 bg-surface-sunken mt-3 aspect-[4/3] w-full max-w-40 border object-cover"
    />
  )
}
