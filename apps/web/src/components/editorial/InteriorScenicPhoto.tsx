'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Caveat } from 'next/font/google'
import type { Locale } from '@vardenia/i18n'
import { useDesktopEdition } from './useDesktopEdition'
import { useJourneyMotion } from '../journey/browser-state'
import { PinnedScenicPhoto } from '../journey/PinnedScenicPhoto'
import { mountPinnedPhotos } from '../journey/pinned-physics'
import { directoryFor, type Destination } from '../journey/destinations'

const caption = Caveat({
  weight: '500',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-home-handwriting',
})

export function InteriorScenicPhoto({
  locale,
  place,
  directoryShown,
  image,
  children,
  className,
  pinOnRight = true,
}: {
  locale: Locale
  place:
    | Destination
    | { id: string; name: string; ar: string; image: string; alt: string; where?: string }
  directoryShown: boolean
  image: ReactNode
  children: ReactNode
  className?: string
  pinOnRight?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const desktop = useDesktopEdition(locale)
  const [motion] = useJourneyMotion()
  useEffect(() => {
    if (desktop && motion && host.current) return mountPinnedPhotos(host.current)
  }, [desktop, motion, place.id])

  if (!desktop)
    return (
      <figure className={className} data-vd-reveal>
        {image}
        {children}
      </figure>
    )
  const label = directoryShown ? `Explore ${place.name}.` : place.name
  return (
    <div ref={host} className={`vd-interior-print ${caption.variable}`}>
      <PinnedScenicPhoto
        photo={place}
        label={place.name}
        image={image}
        ready
        className={pinOnRight ? 'vd-interior-print-right' : ''}
        href={directoryShown && place.where ? directoryFor({ where: place.where }) : undefined}
        interactive={motion}
        dragLabel={motion ? `${label} Drag to swing the photo; arrow keys also work.` : label}
      />
    </div>
  )
}
