/*
 * Vardenia's service worker. Registered by components/ServiceWorker.tsx.
 *
 * It does one thing: when a page cannot be reached because the phone has no
 * connection, it shows /offline.html instead of the browser's own error. Every
 * page still comes from the network, every time; nothing else is cached, so
 * this can never serve an out-of-date page. The admin panel and the API are
 * left entirely alone.
 *
 * To retire it, replace this file with one that calls
 * self.registration.unregister() and deploy: browsers check for a new version
 * on every visit.
 */
const CACHE = 'vardenia-offline-v1'
const OFFLINE = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      // Starts the page request while the worker is still waking up, so a
      // visit costs no extra time for passing through it.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.mode !== 'navigate' || request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (/^\/(admin|api)(\/|$)/.test(url.pathname)) return

  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse
        if (preloaded) return preloaded
        return await fetch(request)
      } catch {
        return (await caches.match(OFFLINE)) || Response.error()
      }
    })(),
  )
})
