'use client'
import { useTranslations } from 'next-intl'
import { useJourneyMotion } from '../journey/browser-state'
export function MotionControl() {
  const [enabled, toggle] = useJourneyMotion()
  const t = useTranslations('journey')
  return (
    <button className="vd-footer-motion" type="button" onClick={toggle} aria-pressed={enabled}>
      {t(enabled ? 'motionOn' : 'motionOff')}
    </button>
  )
}
