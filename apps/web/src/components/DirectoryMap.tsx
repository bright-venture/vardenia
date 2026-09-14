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
 * `'self'`. The clustering plugin (leaflet.markercluster) is bundled the same
 * way and needs no network of its own.
 *
 * # Why it initialises in an effect
 *
 * Leaflet touches `window` and `document` the moment it is imported, which is
 * fatal during server rendering - and a client component still renders on the
 * server for its first paint. So `leaflet` (and its cluster plugin) is imported
 * dynamically inside the effect, where the code only ever runs in the browser.
 * The container ships in the SSR'd HTML as an empty sized box; the map fills it
 * after hydration. Only the plugin's stylesheets are imported at module top,
 * which is inert on the server.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { DivIcon, Layer, Map as LeafletMap, Marker } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

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
// pulls in Leaflet's stylesheet, and a few dots do not justify dragging the whole
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

/**
 * The slice of leaflet.markercluster this file uses, typed on our side rather
 * than through the plugin's ambient augmentation - so `L.markerClusterGroup`
 * is known to the compiler without a module-augmentation import that would have
 * to run on the server to take effect.
 */
interface ClusterMarker {
  getChildCount(): number
}
interface MarkerClusterGroup extends Layer {
  addLayer(layer: Layer): this
  addTo(map: LeafletMap): this
}
interface ClusterCapableL {
  markerClusterGroup(options?: {
    iconCreateFunction?: (cluster: ClusterMarker) => DivIcon
    maxClusterRadius?: number
    showCoverageOnHover?: boolean
    spiderfyOnMaxZoom?: boolean
    chunkedLoading?: boolean
  }): MarkerClusterGroup
}

/** Localized chrome for the "near me" control. */
export interface LocateLabels {
  nearMe: string
  youAreHere: string
  locating: string
  unavailable: string
  outsideArea: string
}

export function DirectoryMap({
  pins,
  label,
  directionsLabel,
  frame,
  locate,
}: {
  pins: MapPin[]
  label: string
  /** "Get directions", already localised, for the link in each popup. */
  directionsLabel: string
  /**
   * The `[[south, west], [north, east]]` box the map opens on and will not leave:
   * Lebanon for the general map, a single governorate when one is filtered. See
   * lib/region-bounds.
   */
  frame: [[number, number], [number, number]]
  /** Localized strings for the geolocation control. */
  locate: LocateLabels
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  /** Set inside the effect so the button can drive the map without a rebuild. */
  const locateRef = useRef<(() => void) | null>(null)

  const [status, setStatus] = useState<string | null>(null)

  /**
   * A stable fingerprint of the pins, so the effect below rebuilds only when the
   * filters actually change the set - not on every unrelated re-render, which
   * would tear the map down and refetch every tile.
   */
  const signature = useMemo(() => pins.map((p) => `${p.slug}:${p.lat},${p.lng}`).join('|'), [pins])

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
      // Extends the same L instance in place with `markerClusterGroup`. Imported
      // after leaflet and only in the browser, for the SSR reason above.
      await import('leaflet.markercluster')
      // Between the await starting and finishing the component may have
      // unmounted, or a newer set of pins may have replaced this one.
      if (cancelled || !containerRef.current) return

      const key = process.env.NEXT_PUBLIC_MAPTILER_KEY
      // MapTiler when a key is present; OpenStreetMap's own tiles otherwise, so
      // the map works the moment this ships and upgrades when the key is added.
      const tileUrl = key
        ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}{r}.png?key=${key}`
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
        // Payload stores a point as [lng, lat] and this pin carries them apart;
        // Google Maps directions want "lat,lng", so the order is set here once.
        const directions = `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`
        marker.bindPopup(
          `<a class="v-pop" href="${pin.href}"><strong>${escapeHtml(pin.name)}</strong>${
            meta ? `<span class="v-pop-meta">${meta}</span>` : ''
          }</a>` +
            `<a class="v-pop-dir" href="${directions}" target="_blank" rel="noopener noreferrer">${escapeHtml(
              directionsLabel,
            )} ↗</a>`,
        )
        return marker
      })

      /**
       * Cluster overlapping pins into a count bubble that splits apart on zoom.
       *
       * The directory is dense in a few places - central Beirut above all - where
       * a dozen listings share a block and their dots merge into an unreadable
       * blob. Clustering replaces that blob with one numbered circle that opens as
       * you zoom in, which is the difference between a map you can use downtown and
       * one you cannot. Sparse governorates are unaffected: a lone pin never
       * clusters with itself.
       */
      if (markers.length) {
        const clusters = (L as unknown as ClusterCapableL).markerClusterGroup({
          maxClusterRadius: 48,
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          chunkedLoading: true,
          iconCreateFunction: (cluster) => {
            const count = cluster.getChildCount()
            const size = count < 10 ? 34 : count < 50 ? 40 : 48
            return L.divIcon({
              className: '',
              html:
                `<div style="width:${size}px;height:${size}px;border-radius:9999px;` +
                `background:${NAVY};border:2px solid ${PAPER};color:${PAPER};` +
                `display:flex;align-items:center;justify-content:center;` +
                `font:600 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace;` +
                `box-shadow:0 2px 8px rgba(11,23,57,.45)">${count}</div>`,
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            })
          },
        })
        for (const marker of markers) clusters.addLayer(marker)
        clusters.addTo(map)
      }

      const frameBounds = L.latLngBounds(frame[0], frame[1])

      /**
       * "Near me": drop a marker at the reader's location and fly to it.
       *
       * Defined here, where `L` and the map are in scope, and exposed through a ref
       * so the button outside the map can call it without rebuilding anything. The
       * marker is added straight to the map, not the cluster, so it never folds
       * into a count and always reads as "you".
       *
       * A reader outside the framed region - the country, or the filtered
       * governorate - is told so rather than flown to a clamped edge of a box they
       * are not in. The frame's own `maxBounds` would otherwise swallow the pan and
       * look broken.
       */
      let userMarker: Marker | null = null
      locateRef.current = () => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          setStatus(locate.unavailable)
          return
        }
        setStatus(locate.locating)
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const m = mapRef.current
            if (!m) return
            const here = L.latLng(position.coords.latitude, position.coords.longitude)
            if (!frameBounds.contains(here)) {
              setStatus(locate.outsideArea)
              return
            }
            const icon = L.divIcon({
              className: '',
              html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${GOLD};border:3px solid ${PAPER};box-shadow:0 0 0 4px rgba(155,106,32,.3),0 1px 6px rgba(11,23,57,.5)"></span>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            })
            if (userMarker) userMarker.setLatLng(here)
            else
              userMarker = L.marker(here, {
                icon,
                title: locate.youAreHere,
                alt: locate.youAreHere,
                keyboard: false,
              }).addTo(m)
            m.flyTo(here, Math.max(m.getZoom(), 14), { duration: 0.6 })
            setStatus(null)
          },
          () => setStatus(locate.unavailable),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
        )
      }

      /**
       * Frame the map on the region box, once the container has a real width.
       *
       * The frame is the country or a governorate, not the pins: the reader asked
       * for "Mount Lebanon" and should get a map of Mount Lebanon, not a tight zoom
       * on the two places in it that happen to have coordinates. So the fit is to
       * `frameBounds`, and the map is then clamped to it - no panning past the box,
       * no zooming out past the point where the whole box is on screen.
       *
       * It waits for a genuine width because `fitBounds` turns geography into
       * pixels and needs the map's true size, which is not reliable at init: the
       * container may still be settling, or (the case that stranded every marker
       * off-screen) the map may have mounted while its tab was hidden and 0px wide,
       * then been shown. Later resizes keep the tiles square.
       */
      let fitted = false
      const observer = new ResizeObserver(() => {
        const m = mapRef.current
        if (!m) return
        if (container.clientWidth < 100) return // Hidden or not yet laid out.
        m.invalidateSize()
        if (!fitted) {
          m.fitBounds(frameBounds, { padding: [20, 20] })
          m.setMaxBounds(frameBounds.pad(0.06))
          m.setMinZoom(m.getBoundsZoom(frameBounds))
          fitted = true
        }
      })
      observer.observe(container)
      observerRef.current = observer
    })()

    return () => {
      cancelled = true
      locateRef.current = null
      observerRef.current?.disconnect()
      observerRef.current = null
      map?.remove()
      mapRef.current = null
    }
  }, [signature, pins, directionsLabel, frame, locate])

  return (
    <div className="relative mt-10">
      <div
        ref={containerRef}
        role="application"
        aria-label={label}
        className="border-ink-100 relative z-0 h-[70vh] min-h-[420px] w-full overflow-hidden border"
      />

      {/* Sits above the map (Leaflet panes are z-index 400-700; this clears them). */}
      <button
        type="button"
        onClick={() => locateRef.current?.()}
        className="border-ink-100 text-ink-900 hover:bg-surface-raised absolute right-3 top-3 z-[1000] inline-flex items-center gap-2 border bg-[#f7f0e4] px-3 py-2 font-mono text-xs shadow-sm transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
        {locate.nearMe}
      </button>

      {status ? (
        <p
          role="status"
          aria-live="polite"
          className="border-ink-100 text-ink-900 absolute bottom-3 left-3 z-[1000] max-w-[70%] border bg-[#f7f0e4] px-3 py-2 text-xs shadow-sm"
        >
          {status}
        </p>
      ) : null}
    </div>
  )
}
