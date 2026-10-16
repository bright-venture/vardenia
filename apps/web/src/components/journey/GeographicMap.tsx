import { useId } from 'react'
import { lebanonPath } from './map-path'
import { MAP_SIZE, RELIEF_FRAME } from './map-projection'
export function GeographicMap({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg
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
      <image
        href="/journey/lebanon-relief-original.png"
        {...RELIEF_FRAME}
        preserveAspectRatio="none"
        clipPath={`url(#${id})`}
        className="vd-map-relief"
      />
      <path d={lebanonPath} className="vd-map-outline" />
    </svg>
  )
}
