'use client'

/**
 * The directory, as a map.
 *
 * # Why Leaflet, and not a GL map
 *
 * The site runs under a deliberately strict Content-Security-Policy (see
 * lib/security-headers): `connect-src` is `'self'` and `worker-src` falls back to
 * `default-src 'self'`. A vector map - MapLibre, Mapbox GL - fetches its style
 * and tiles with `fetch` and runs a blob-URL web worker, and every one of those
 * is refused by that policy. Widening it for a map would punch the exact holes
 * the policy exists to keep shut.
 *
 * Leaflet with raster tiles asks for none of that. Tiles are `<img>` elements,
 * and `img-src` already allows `https:`, so the map needs no CSP change at all.
 * The library is bundled from npm rather than a CDN, which keeps `script-src` at
 * `'self'`.
 *
 * # Why it initialises in an effect
 *
 * Leaflet touches `window` and `document` the moment it is imported, which is
 * fatal during server rendering - and a client component still renders on the
 * server for its first paint. So `leaflet` is imported dynamically inside the
 * effect, where the code only ever runs in the browser. The container ships in
 * the SSR'd HTML as an empty sized box; the map fills it after hydration.
 */

import { useEffect, useMemo, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'

/** One pin, with every label already resolved server-side. */
export interface MapPin {
  slug: string
  name: string
  lat: number
  lng: number
  /** `free` | `listed` | `featured` | `partner` - decides the marker's colour. */
  tier: string
  /** The localized `/directory/[slug]` path, built with the routing helper. */
  href: string
  /** "Achrafieh, Beirut", already localized. */
  place: string
  /** "$$$", or empty. */
  price: string
}

// The brand's navy and gold, inlined rather than imported: this file already
// pulls in Leaflet's stylesheet, and two dots do not justify dragging the whole
// token module into the client bundle. Kept in step with packages/tokens.
const NAVY = '#0b1739'
const GOLD = '#9b6a20'
const PAPER = '#f7f0e4'

/** Featured and partner listings are what an advertiser paid to stand out. */
function markerColor(tier: string): string {
  return tier === 'featured' || tier === 'partner' ? GOLD : NAVY
}

/** Text going into a popup's innerHTML. Names are data and may contain `<`. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function DirectoryMap({ pins, label }: { pins: MapPin[]; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  /**
   * A stable fingerprint of the pins, so the effect below rebuilds only when the
   * filters actually change the set - not on every unrelated re-render, which
   * would tear the map down and refetch every tile.
   */
  const signature = useMemo(
    () => pins.map((p) => `${p.slug}:${p.lat},${p.lng}`).join('|'),
    [pins],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let map: LeafletMap | null = null

    void (async () => {
      // Leaflet is a CommonJS `export =` module, so under esModuleInterop the
      // namespace hangs off `.default` - `(await import('leaflet')).map` is
      // undefined, `.default.map` is the function.
      const L = (await import('leaflet')).default
      // Between the await starting and finishing the component may have
      // unmounted, or a newer set of pins may have replaced this one.
      if (cancelled || !containerRef.current) return

      const key = process.env.NEXT_PUBLIC_MAPTILER_KEY
      // MapTiler when a key is present; OpenStreetMap's own tiles otherwise, so
      // the map works the moment this ships and upgrades when the key is added.
      const tileUrl = key
        ? `https://api.maptiler.com/maps/dataviz-light/{z}/{x}/{y}{r}.png?key=${key}`
        : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      const attribution = key
        ? '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

      map = L.map(container, {
        scrollWheelZoom: false, // A map inside a scrolling page must not eat the scroll.
        attributionControl: true,
        // A valid view from the outset - centred on Lebanon - so `invalidateSize`
        // below has a center and zoom to work from. `fitBounds` then reframes it.
        center: [33.8547, 35.8623],
        zoom: 8,
      })
      mapRef.current = map

      L.tileLayer(tileUrl, {
        attribution,
        maxZoom: 19,
        detectRetina: Boolean(key), // OSM has no @2x tiles; MapTiler does.
      }).addTo(map)

      const markers = pins.map((pin) => {
        const color = markerColor(pin.tier)
        const icon = L.divIcon({
          className: '', // Drop Leaflet's default box so only our dot shows.
          html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid ${PAPER};box-shadow:0 1px 4px rgba(11,23,57,.45)"></span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          popupAnchor: [0, -10],
        })

        const meta = [escapeHtml(pin.place), escapeHtml(pin.price)].filter(Boolean).join(' · ')
        const marker = L.marker([pin.lat, pin.lng], {
          icon,
          title: pin.name,
          keyboard: true,
          alt: pin.name,
        })
        marker.bindPopup(
          `<a class="v-pop" href="${pin.href}"><strong>${escapeHtml(pin.name)}</strong>${
            meta ? `<span class="v-pop-meta">${meta}</span>` : ''
          }</a>`,
        )
        return marker
      })

      const group = markers.length ? L.featureGroup(markers).addTo(map) : null
      const bounds = group ? group.getBounds() : null

      /**
       * Frame the pins only once the container has a real width.
       *
       * `fitBounds` turns geography into pixels, so it needs the map's true size -
       * and that size is not reliably known at init. The container may still be
       * settling, or (the case that stranded every marker thousands of pixels
       * off-screen) the map may have mounted while its tab was hidden and 0px
       * wide, then been shown. A ResizeObserver waits for a genuine width, squares
       * the tiles to it, and fits the pins the first time round. Later resizes - a
       * rotated phone, a widened window - keep the tiles square without yanking
       * the view back from wherever the reader has panned to.
       */
      let fitted = false
      const observer = new ResizeObserver(() => {
        if (!mapRef.current) return
        if (container.clientWidth < 100) return // Hidden or not yet laid out.
        mapRef.current.invalidateSize()
        if (!fitted && bounds) {
          mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
          fitted = true
        }
      })
      observer.observe(container)
      observerRef.current = observer
    })()

    return () => {
      cancelled = true
      observerRef.current?.disconnect()
      observerRef.current = null
      map?.remove()
      mapRef.current = null
    }
  }, [signature, pins])

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={label}
      className="border-ink-100 relative z-0 mt-10 h-[70vh] min-h-[420px] w-full overflow-hidden border"
    />
  )
}
