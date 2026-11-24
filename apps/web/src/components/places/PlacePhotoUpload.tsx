'use client'

import { useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { tokenFromHash } from '../../lib/place-upload-url'
import { ERROR_TEXT, HINT, LABEL, NOTICE_ERROR, NOTICE_SUCCESS } from '../formStyles'
import { PHOTO_ACCEPT, preparePhoto } from './photos'
import { postPlacePhoto, type PhotoSlot, type UploadResult } from './upload-client'

/**
 * The phone page of the Magazine Places form (step 2): the owner scans the QR
 * code on the big screen and sends the logo and the main photo from here.
 *
 * PLACEHOLDER layout: a teammate will restyle it. It uses the site's existing
 * classes only.
 *
 * The session token arrives in the URL FRAGMENT (#t=...). It is read once, the
 * fragment is removed from the address bar at once (history.replaceState, so it
 * is not in the history, a bookmark or a screenshot) and it lives only in
 * memory from then on. It is never put in a query string, a log or storage.
 * A page opened without one (or whose link is dead) says so plainly.
 */

type SlotState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'received' }
  | { kind: 'error'; reason: 'bad-file' | 'rate-limited' | 'failed' }

const SLOTS: PhotoSlot[] = ['logo', 'hero']

/**
 * The token, captured once from the address bar and kept in memory only.
 * Read through useSyncExternalStore so the server render and hydration see
 * `undefined` (nothing yet) and the browser then sees the real value, without
 * an effect that sets state. Reading it also removes the fragment from the
 * address bar (history.replaceState), so it is not in the history, a bookmark
 * or a screenshot. Idempotent; the cache keeps the snapshot stable.
 */
let captured: { token: string | null } | undefined

function captureToken(): string | null {
  if (!captured) {
    const token = tokenFromHash(window.location.hash)
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    captured = { token }
  }
  return captured.token
}

/** Test seam: forget the captured token so the next mount reads the address bar again. */
export function __resetCapturedToken() {
  captured = undefined
}

const subscribe = () => () => {}
const serverToken = () => undefined

export function PlacePhotoUpload() {
  const t = useTranslations('magazinePlaces.upload')
  // undefined until the browser has read it; null when there is none.
  const token = useSyncExternalStore(subscribe, captureToken, serverToken)
  const [expired, setExpired] = useState(false)
  const [slots, setSlots] = useState<Record<PhotoSlot, SlotState>>({
    logo: { kind: 'idle' },
    hero: { kind: 'idle' },
  })

  const set = (slot: PhotoSlot, state: SlotState) =>
    setSlots((current) => ({ ...current, [slot]: state }))

  async function choose(slot: PhotoSlot, event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    if (!file || !token) return
    set(slot, { kind: 'sending' })
    let result: UploadResult
    try {
      // Phone photos are shrunk before they are sent, like the old form's.
      result = await postPlacePhoto(token, slot, await preparePhoto(file))
    } catch {
      result = { kind: 'bad-file' }
    }
    input.value = ''
    if (result.kind === 'ok') set(slot, { kind: 'received' })
    else if (result.kind === 'dead') setExpired(true)
    else set(slot, { kind: 'error', reason: result.kind })
  }

  if (token === undefined) return null

  if (token === null || expired) {
    return (
      <section data-upload-dead aria-live="polite">
        <h2 className="font-display text-ink-900 text-2xl">{t('deadTitle')}</h2>
        <p className={`${NOTICE_ERROR} mt-4`} role="alert">
          {t('dead')}
        </p>
      </section>
    )
  }

  const bothDone = slots.logo.kind === 'received' && slots.hero.kind === 'received'

  return (
    <section data-upload className="space-y-6">
      <p className="text-ink-700 text-sm">{t('intro')}</p>
      {SLOTS.map((slot) => {
        const state = slots[slot]
        const id = `place-upload-${slot}`
        return (
          <div key={slot}>
            <label className={LABEL} htmlFor={id}>
              {t(slot === 'logo' ? 'logoLabel' : 'heroLabel')}
            </label>
            <input
              id={id}
              name={slot}
              type="file"
              accept={PHOTO_ACCEPT}
              disabled={state.kind === 'sending'}
              onChange={(event) => void choose(slot, event)}
              aria-describedby={`${id}-hint`}
              className="text-ink-700 file:bg-cedar-900 file:text-surface-base hover:file:bg-cedar-700 mt-1.5 block w-full text-sm file:me-3 file:min-h-11 file:cursor-pointer file:border-0 file:px-4 file:text-sm file:font-semibold disabled:opacity-60"
            />
            <p id={`${id}-hint`} className={HINT}>
              {t('hint')}
            </p>
            <p data-slot-state={state.kind} className="mt-1.5 text-sm" role="status">
              {state.kind === 'sending' ? t('sending') : null}
              {state.kind === 'received' ? t('received') : null}
            </p>
            {state.kind === 'error' ? (
              <p className={ERROR_TEXT} role="alert">
                {t(
                  state.reason === 'bad-file'
                    ? 'badFile'
                    : state.reason === 'rate-limited'
                      ? 'tooMany'
                      : 'failed',
                )}
              </p>
            ) : null}
          </div>
        )
      })}
      {bothDone ? (
        <p className={NOTICE_SUCCESS} role="status">
          {t('bothDone')}
        </p>
      ) : null}
    </section>
  )
}
