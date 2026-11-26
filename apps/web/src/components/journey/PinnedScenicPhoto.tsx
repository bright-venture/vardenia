import React from 'react'
import { Link } from '../../i18n/routing'
import { Coordinates } from './Coordinates'
import type { ScenePhoto } from './destinations'

/** A native city link, with dragging handled separately by the pin controller. */
export function PinnedScenicPhoto({
  photo,
  label,
  className,
  ready,
  interactive,
  dragLabel,
  href,
  image,
}: {
  photo: Omit<ScenePhoto, 'lat' | 'lon'> & Partial<Pick<ScenePhoto, 'lat' | 'lon'>>
  label: string
  className: string
  ready: boolean
  interactive: boolean
  dragLabel: string
  href?: string
  image?: React.ReactNode
}) {
  const assets = '/journey/'
  const contents = (
    <>
      <div className="vd-scene-image">
        {image ?? (
          <img
            src={ready ? assets + photo.image : undefined}
            srcSet={
              ready
                ? `${assets + photo.image.replace('.webp', '-m.webp')} 640w, ${assets + photo.image} 1600w`
                : undefined
            }
            sizes="(max-width:700px) calc(100vw - 48px), 60vw"
            alt={photo.alt}
            width="1600"
            height="1200"
            loading="lazy"
            draggable={false}
          />
        )}
      </div>
      <span className="vd-photo-caption">
        <span>{label}</span>
        {photo.lat !== undefined && photo.lon !== undefined && (
          <Coordinates place={{ lat: photo.lat, lon: photo.lon }} enabled={false} label={label} />
        )}
      </span>
    </>
  )
  const common = {
    className: 'vd-pinned-print',
    'data-vd-draggable': interactive ? 'true' : undefined,
    'aria-label': dragLabel,
    title: dragLabel,
    'aria-keyshortcuts': interactive ? 'ArrowLeft ArrowRight Space Home Escape' : undefined,
  }
  return (
    <figure className={`vd-scene-photo vd-pinned-photo ${className}`} data-vd-reveal>
      {href ? (
        <Link {...common} href={href} prefetch={false} draggable={false}>
          {contents}
        </Link>
      ) : (
        <div
          {...common}
          role={interactive ? 'button' : undefined}
          tabIndex={interactive ? 0 : undefined}
        >
          {contents}
        </div>
      )}
      <figcaption className="sr-only">{label}</figcaption>
      <img
        className="vd-photo-pin"
        src="/journey/brass-photo-pin.png"
        width="32"
        height="48"
        alt=""
        aria-hidden="true"
      />
    </figure>
  )
}
