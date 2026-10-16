'use client'
import { useSyncExternalStore } from 'react'
import { DESTINATIONS } from './destinations'
const routeKey = 'vardenia-discovery-route',
  routeEvent = 'vardenia:discovery-route',
  motionEvent = 'vardenia:motion'
const emptyRoute: string[] = []
let cachedRoute: string[] = emptyRoute,
  cachedRaw: string | null = null
export function parseDiscoveryRoute(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(value)
      ? [...new Set(value)].filter(
          (id): id is string => typeof id === 'string' && DESTINATIONS.some((p) => p.id === id),
        )
      : []
  } catch {
    return []
  }
}
function readRoute() {
  try {
    const raw = localStorage.getItem(routeKey)
    if (raw !== cachedRaw) {
      cachedRaw = raw
      cachedRoute = parseDiscoveryRoute(raw)
    }
  } catch {}
  return cachedRoute
}
function subscribeRoute(callback: () => void) {
  const storage = (e: StorageEvent) => {
    if (e.key === routeKey || e.key === null) callback()
  }
  window.addEventListener('storage', storage)
  window.addEventListener(routeEvent, callback)
  return () => {
    window.removeEventListener('storage', storage)
    window.removeEventListener(routeEvent, callback)
  }
}
function updateRoute(update: string[] | ((current: string[]) => string[])) {
  const next = typeof update === 'function' ? update(readRoute()) : update
  cachedRoute = parseDiscoveryRoute(JSON.stringify(next))
  cachedRaw = JSON.stringify(cachedRoute)
  try {
    localStorage.setItem(routeKey, cachedRaw)
  } catch {}
  window.dispatchEvent(new Event(routeEvent))
}
export function useDiscoveryRoute() {
  const route = useSyncExternalStore(subscribeRoute, readRoute, () => emptyRoute)
  return [route, updateRoute] as const
}
let memoryMotion = true
function readMotion() {
  let off = !memoryMotion
  try {
    off = localStorage.getItem('vardenia-motion') === 'off'
  } catch {}
  return !off && !matchMedia('(prefers-reduced-motion: reduce)').matches
}
function subscribeMotion(callback: () => void) {
  const media = matchMedia('(prefers-reduced-motion: reduce)')
  media.addEventListener('change', callback)
  window.addEventListener('storage', callback)
  window.addEventListener(motionEvent, callback)
  return () => {
    media.removeEventListener('change', callback)
    window.removeEventListener('storage', callback)
    window.removeEventListener(motionEvent, callback)
  }
}
export function useJourneyMotion() {
  const enabled = useSyncExternalStore(subscribeMotion, readMotion, () => true)
  const toggle = () => {
    try {
      memoryMotion = !enabled
      localStorage.setItem('vardenia-motion', enabled ? 'off' : 'on')
    } catch {}
    window.dispatchEvent(new Event(motionEvent))
  }
  return [enabled, toggle] as const
}
