'use client'

import { useSyncExternalStore } from 'react'

const desktop = '(min-width: 1051px)'

function viewportStore(query: string) {
  function subscribe(notify: () => void) {
    if (typeof window.matchMedia !== 'function') return () => {}
    const media = window.matchMedia(query)
    media.addEventListener('change', notify)
    return () => media.removeEventListener('change', notify)
  }
  return { subscribe, read: () => window.matchMedia?.(query).matches ?? false }
}
const desktopStore = viewportStore(desktop)
const homeStore = viewportStore('(max-width: 700px), (min-width: 1051px)')
const getServerSnapshot = () => false

export function useDesktopViewport() {
  return useSyncExternalStore(desktopStore.subscribe, desktopStore.read, getServerSnapshot)
}

export function useDesktopEdition(locale: string) {
  const wide = useDesktopViewport()
  return wide && locale === 'en'
}

export function useEnglishHomeEdition(locale: string) {
  const supported = useSyncExternalStore(homeStore.subscribe, homeStore.read, getServerSnapshot)
  return supported && locale === 'en'
}
