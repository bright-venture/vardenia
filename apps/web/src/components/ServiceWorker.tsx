'use client'

import { useEffect } from 'react'

/**
 * Registers public/sw.js, which shows an offline page when a phone loses its
 * connection and does nothing else (see that file).
 *
 * Production builds only, after the page has loaded, so it never competes with
 * the first screen. Local development keeps no worker, which would otherwise
 * outlive a code change and confuse what the dev server is showing.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Not having one only means no offline page; nothing to report.
      })
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
