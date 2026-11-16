'use client'
import { useTranslations } from 'next-intl'
import { useJourneyMotion } from '../journey/browser-state'

/**
 * The footer's motion setting: its state in words and a small switch beside
 * them (home-finish.css, .vd-footer-motion). The words carry the meaning; the
 * switch only shows it.
 */
export function MotionControl() {
  const [enabled, toggle] = useJourneyMotion()
  const t = useTranslations('journey')
  return (
    <button className="vd-footer-motion" type="button" onClick={toggle} aria-pressed={enabled}>
      {t(enabled ? 'motionOn' : 'motionOff')}
      <span className="vd-footer-switch" aria-hidden>
        <span />
      </span>
    </button>
  )
}
