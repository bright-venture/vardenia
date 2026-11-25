'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { HINT, NOTICE_SUCCESS, PRIMARY_BUTTON } from '../formStyles'

/** How long the thank-you stays before the kiosk clears itself. */
export const THANKS_MS = 60 * 1000

/**
 * Step 4: the thank-you and the reference. The screen is shared, so it clears
 * itself after a minute, or at once on "Start a new one" (the parent resets
 * every piece of state, token included).
 */
export function ThanksStep({
  reference,
  onDone,
  ms = THANKS_MS,
}: {
  reference: string
  onDone: () => void
  ms?: number
}) {
  const t = useTranslations('magazinePlaces')
  const ref = useRef<HTMLDivElement>(null)
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  })

  useEffect(() => {
    ref.current?.focus()
    const timer = setTimeout(() => doneRef.current(), ms)
    return () => clearTimeout(timer)
  }, [ms])

  return (
    <section className="flex flex-col gap-4">
      <div ref={ref} tabIndex={-1} role="status" className={`${NOTICE_SUCCESS} focus:outline-none`}>
        <p className="font-semibold">{t('flow.thanks')}</p>
        <p className="mt-2" dir="auto">
          {t('flow.reference', { reference })}
        </p>
      </div>
      <p className={HINT}>{t('flow.clearsSoon')}</p>
      <div>
        <button type="button" className={PRIMARY_BUTTON} onClick={onDone}>
          {t('flow.startNew')}
        </button>
      </div>
    </section>
  )
}
