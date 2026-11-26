'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ERROR_TEXT, HINT, LABEL, NOTICE_ERROR, PRIMARY_BUTTON } from '../formStyles'
import { PHOTO_ACCEPT, PhotoError, isAcceptedPhoto, preparePhoto } from './photos'
import { PlaceQr } from './PlaceQr'
import { postPlacePhoto, type PhotoSlot } from './upload-client'
import { usePhotoStatus } from './use-photo-status'

/**
 * Step 2 of the big-screen form: the QR code the owner scans to send the logo
 * and the main photo from their phone, a live tick for each photo as it
 * arrives, and a fallback to send them from this computer instead.
 *
 * The upload link and the session token come from the parent's memory and
 * stay in this subtree only while the step is on screen. The link is shown as
 * text only inside the collapsed "Can't scan?" block.
 */

const SLOTS: Array<{ slot: PhotoSlot; row: 'logoRow' | 'heroRow' }> = [
  { slot: 'logo', row: 'logoRow' },
  { slot: 'hero', row: 'heroRow' },
]

type SlotProblem =
  'upload.badFile' | 'upload.tooMany' | 'upload.failed' | 'errors.photoType' | 'errors.photoFailed'

export function PhoneStep({
  token,
  uploadUrl,
  problem: finishProblem,
  onContinue,
  onGone,
  onActivity,
}: {
  token: string
  uploadUrl: string
  /** A sentence from the last attempt to finish (for example the photos are missing). */
  problem?: string | null
  onContinue: () => void
  onGone: () => void
  onActivity: () => void
}) {
  const t = useTranslations('magazinePlaces')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(true)
  const { status, markReceived } = usePhotoStatus({ token, onGone, onReceived: onActivity })
  const [sending, setSending] = useState<PhotoSlot | null>(null)
  const [problems, setProblems] = useState<Partial<Record<PhotoSlot, SlotProblem>>>({})

  useEffect(() => {
    mounted.current = true
    headingRef.current?.focus()
    return () => {
      mounted.current = false
    }
  }, [])

  const problem = (slot: PhotoSlot, kind: SlotProblem | undefined) =>
    setProblems((current) => ({ ...current, [slot]: kind }))

  async function choose(slot: PhotoSlot, event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    // Cleared so choosing the same file again still fires a change.
    input.value = ''
    if (!file) return
    problem(slot, undefined)
    if (!isAcceptedPhoto(file)) {
      problem(slot, 'errors.photoType')
      return
    }
    setSending(slot)
    try {
      let ready: File
      try {
        ready = await preparePhoto(file)
      } catch (error) {
        if (mounted.current) {
          problem(
            slot,
            error instanceof PhotoError && error.problem === 'type'
              ? 'errors.photoType'
              : 'errors.photoFailed',
          )
        }
        return
      }
      const result = await postPlacePhoto(token, slot, ready)
      if (!mounted.current) return
      if (result.kind === 'ok') markReceived(result.logoReceived, result.heroReceived)
      else if (result.kind === 'dead') onGone()
      else if (result.kind === 'bad-file') problem(slot, 'upload.badFile')
      else if (result.kind === 'rate-limited') problem(slot, 'upload.tooMany')
      else problem(slot, 'upload.failed')
    } finally {
      if (mounted.current) setSending(null)
    }
  }

  const both = status.logo && status.hero

  return (
    <section className="flex flex-col gap-6" aria-labelledby="place-step-photos">
      <h3
        id="place-step-photos"
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-ink-900 text-xl focus:outline-none"
      >
        {t('flow.photosTitle')}
      </h3>

      {finishProblem ? (
        <p className={NOTICE_ERROR} role="alert">
          {finishProblem}
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-4">
        <PlaceQr value={uploadUrl} alt={t('flow.qrAlt')} />
        <p className="text-ink-900 text-center text-lg font-semibold">{t('flow.qrInstruction')}</p>
        <details className="w-full max-w-sm">
          <summary className="text-ink-700 hover:text-ink-900 min-h-11 cursor-pointer text-sm underline underline-offset-4">
            {t('flow.cantScan')}
          </summary>
          <p className={HINT}>{t('flow.cantScanHint')}</p>
          <p dir="ltr" className="text-ink-900 mt-1.5 select-all break-all text-sm">
            {uploadUrl}
          </p>
        </details>
      </div>

      <ul className="flex flex-col gap-2" aria-live="polite">
        {SLOTS.map(({ slot, row }) => {
          const got = status[slot]
          return (
            <li
              key={slot}
              data-slot={slot}
              data-received={got}
              className="border-ink-100 flex items-center justify-between gap-3 border px-4 py-3 text-sm"
            >
              <span className="text-ink-900 font-semibold">{t(`flow.${row}`)}</span>
              <span className={got ? 'text-cedar-900 font-semibold' : 'text-ink-500'}>
                {got ? `✓ ${t('flow.received')}` : t('flow.waiting')}
              </span>
            </li>
          )
        })}
      </ul>

      <details className="w-full">
        <summary className="text-ink-700 hover:text-ink-900 min-h-11 cursor-pointer text-sm underline underline-offset-4">
          {t('flow.computerButton')}
        </summary>
        <div className="mt-3 flex flex-col gap-5">
          {SLOTS.map(({ slot, row }) => {
            const id = `place-computer-${slot}`
            const error = problems[slot]
            return (
              <div key={slot}>
                <label className={LABEL} htmlFor={id}>
                  {t(`flow.${row}`)}
                </label>
                <input
                  id={id}
                  name={`computer-${slot}`}
                  type="file"
                  accept={PHOTO_ACCEPT}
                  disabled={sending !== null}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onChange={(event) => void choose(slot, event)}
                  className="text-ink-700 file:bg-cedar-900 file:text-surface-base hover:file:bg-cedar-700 mt-1.5 block w-full text-sm file:me-3 file:min-h-11 file:cursor-pointer file:border-0 file:px-4 file:text-sm file:font-semibold disabled:opacity-60"
                />
                {sending === slot ? (
                  <p className={HINT} role="status">
                    {t('upload.sending')}
                  </p>
                ) : null}
                {error ? (
                  <p id={`${id}-error`} className={ERROR_TEXT} role="alert">
                    {t(error)}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </details>

      <div className="flex flex-col gap-3">
        <div>
          <button
            type="button"
            className={PRIMARY_BUTTON}
            disabled={!both}
            aria-describedby={both ? undefined : 'place-continue-needs'}
            onClick={onContinue}
          >
            {t('flow.continue')}
          </button>
        </div>
        {both ? null : (
          <p id="place-continue-needs" className={HINT}>
            {t('flow.continueNeeds')}
          </p>
        )}
      </div>
    </section>
  )
}
