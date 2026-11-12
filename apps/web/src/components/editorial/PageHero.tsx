import Image from 'next/image'
import type { ReactNode } from 'react'
import type { Locale } from '@vardenia/i18n'
import { Coordinates } from '../journey/Coordinates'
import { DESTINATIONS } from '../journey/destinations'

/**
 * Contextual Lebanese photography, never presented as a pictured business.
 *
 * The picture is one of the journey's destinations, by index (`place`), shown
 * with its coordinates; or a page's own photograph (`photo`), shown plain, as
 * the sections have since 11 November 2026. `body` is a longer line under the
 * intro.
 */
export function PageHero({
  title,
  intro,
  body,
  place = 0,
  photo,
  locale,
  children,
  immersive = false,
}: {
  title: string
  intro?: string
  body?: string
  place?: number
  photo?: {
    src: string
    alt: string
    width?: number
    height?: number
    /** A smaller picture laid over the main one's lower corner. */
    inset?: { src: string; alt: string; width: number; height: number }
  }
  locale: Locale
  children?: ReactNode
  immersive?: boolean
}) {
  const destination = DESTINATIONS[place] ?? DESTINATIONS[0]
  const portrait = photo?.width && photo.height ? photo.height > photo.width : false
  return (
    <header className={`vd-inner-hero ${immersive ? 'vd-inner-hero-immersive' : ''}`}>
      <div className="vd-inner-hero-copy">
        <h1 data-vd-reveal>{title}</h1>
        {intro ? <p data-vd-reveal>{intro}</p> : null}
        {body ? (
          <p className="vd-inner-hero-body" data-vd-reveal>
            {body}
          </p>
        ) : null}
        {children ? (
          <div className="vd-inner-hero-actions" data-vd-reveal>
            {children}
          </div>
        ) : null}
      </div>
      {photo?.inset ? (
        <div className="vd-inner-hero-collage" data-vd-reveal>
          <figure className="vd-inner-hero-media">
            <Image
              src={photo.src}
              alt={photo.alt}
              width={photo.width ?? 1536}
              height={photo.height ?? 1024}
              sizes="(max-width:700px) 100vw, 60vw"
              priority
            />
          </figure>
          <figure
            className={`vd-inner-hero-inset ${photo.inset.width > photo.inset.height ? 'vd-inner-hero-inset-wide' : ''}`}
          >
            <Image
              src={photo.inset.src}
              alt={photo.inset.alt}
              width={photo.inset.width}
              height={photo.inset.height}
              sizes={
                photo.inset.width > photo.inset.height
                  ? '(max-width:700px) 60vw, 30vw'
                  : '(max-width:700px) 44vw, 22vw'
              }
              priority
            />
          </figure>
        </div>
      ) : (
        <figure
          className={`vd-inner-hero-media ${portrait ? 'vd-inner-hero-media-portrait' : ''}`}
          data-vd-reveal
        >
          {photo ? (
            <Image
              src={photo.src}
              alt={photo.alt}
              width={photo.width ?? 1536}
              height={photo.height ?? 1024}
              sizes="(max-width:700px) 100vw, 60vw"
              priority
            />
          ) : (
            <>
              <Image
                src={`/journey/${destination.image.replace(/\.jpg$/, '.webp')}`}
                alt={destination.alt}
                width={1600}
                height={1200}
                sizes="(max-width:700px) 100vw, 60vw"
                priority
              />
              <Coordinates
                place={destination}
                enabled
                label={locale === 'ar' ? destination.ar : destination.name}
              />
            </>
          )}
        </figure>
      )}
    </header>
  )
}
