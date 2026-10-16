'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { lebanonPath } from './map-path'
import { MAP_SIZE, RELIEF_FRAME } from './map-projection'

/**
 * Lebanon's outline, with the relief photograph clipped inside it.
 *
 * The relief is an SVG <image>, which browsers fetch as soon as it is in the
 * document - there is no `loading="lazy"` for it. Rendered three times on the
 * home page, all below the first screen, it was downloaded alongside the hero
 * photograph and slowed the first view. So the outline is drawn at once and
 * the relief is added when the map comes within a screen of the viewport,
 * which is what lazy loading does for an <img>.
 */
export function GeographicMap({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  const frame = useRef<SVGSVGElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = frame.current
    if (!el || near) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: '100% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [near])

  return (
    <svg
      ref={frame}
      className={className}
      viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
      aria-hidden
      focusable="false"
    >
      <defs>
        <clipPath id={id}>
          <path d={lebanonPath} />
        </clipPath>
      </defs>
      {near && (
        <image
          href="/journey/lebanon-relief.webp"
          {...RELIEF_FRAME}
          preserveAspectRatio="none"
          clipPath={`url(#${id})`}
          className="vd-map-relief"
        />
      )}
      <path d={lebanonPath} className="vd-map-outline" />
    </svg>
  )
}
