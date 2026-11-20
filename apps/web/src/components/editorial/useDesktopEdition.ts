'use client'

import { useSyncExternalStore } from 'react'

const desktop = '(min-width: 1051px)'

function subscribe(notify: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia(desktop)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
const getSnapshot = () => window.matchMedia?.(desktop).matches ?? false
const getServerSnapshot = () => false

export function useDesktopViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function useDesktopEdition(locale: string) {
  const wide = useDesktopViewport()
  return wide && locale === 'en'
}
