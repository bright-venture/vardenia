import Image from 'next/image'
import type { ReactNode } from 'react'
import type { Locale } from '@vardenia/i18n'
import { Coordinates } from '../journey/Coordinates'
import { DESTINATIONS } from '../journey/destinations'

/** Contextual Lebanese photography, never presented as a pictured business. */
export function PageHero({
  title,
  intro,
  place = 0,
  locale,
  children,
  immersive = false,
}: {
  title: string
  intro?: string
  place?: number
  locale: Locale
  children?: ReactNode
  immersive?: boolean
}) {
  const destination = DESTINATIONS[place] ?? DESTINATIONS[0]
  return (
    <header className={`vd-inner-hero ${immersive ? 'vd-inner-hero-immersive' : ''}`}>
      <div className="vd-inner-hero-copy">
        <h1 data-vd-reveal>{title}</h1>
        {intro ? <p data-vd-reveal>{intro}</p> : null}
        {children ? (
          <div className="vd-inner-hero-actions" data-vd-reveal>
            {children}
          </div>
        ) : null}
      </div>
      <figure className="vd-inner-hero-media" data-vd-reveal>
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
      </figure>
    </header>
  )
}
