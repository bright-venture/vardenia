'use client'
import { LinkArrow } from '../LinkArrow'
import Image from 'next/image'
import { useId, useState } from 'react'
import { Link } from '../../i18n/routing'
import { Coordinates } from '../journey/Coordinates'
import { DESTINATIONS } from '../journey/destinations'
import { useJourneyMotion } from '../journey/browser-state'

/**
 * One row of a large header menu: a name in the display face, a line saying
 * what is behind it, and the photograph shown beside the list while it is
 * pointed at or focused.
 *
 * The photograph is either one of the journey's destinations, by index into
 * DESTINATIONS, shown with its coordinates, or a photograph of the row's own
 * (the magazine's spread), shown plain.
 */
export interface DiscoveryCategory {
  href: string
  name: string
  description: string
  destination?: number
  photo?: { src: string; alt: string }
}

/**
 * The large header menu: Discover, Magazine and About all open this, so the
 * three read as one set (10 November 2026; Magazine and About used to be small
 * lists of icon rows).
 *
 * The links always navigate; previewing a photograph is a pointer/keyboard
 * enhancement.
 */
export function DiscoveryMenu({
  title,
  body,
  items,
  arabic,
  footer,
}: {
  title: string
  body: string
  items: DiscoveryCategory[]
  arabic: boolean
  /** A link under the list, such as the whole directory. */
  footer?: { href: string; label: string }
}) {
  const [active, setActive] = useState(0)
  const [motion] = useJourneyMotion()
  // Three of these sit in the header at once, so the heading id is per menu.
  const headingId = useId()
  const item = items[active] ?? items[0]
  const place = item?.photo ? null : (DESTINATIONS[item?.destination ?? 0] ?? DESTINATIONS[0])
  const photo = item?.photo ?? (place ? { src: `/journey/${place.image}`, alt: place.alt } : null)
  return (
    <div className="vd-discovery-menu">
      <header className="vd-discovery-heading">
        <h2 id={headingId}>{title}</h2>
        <p>{body}</p>
      </header>
      <div className="vd-discovery-composition">
        <nav aria-labelledby={headingId}>
          <ul>
            {items.map((entry, index) => (
              <li key={entry.href} data-active={active === index}>
                <Link
                  href={entry.href}
                  onPointerEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                >
                  <span>
                    <strong>{entry.name}</strong>
                    <span>{entry.description}</span>
                  </span>
                  <span className="vd-discovery-arrow" aria-hidden>
                    <LinkArrow />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {footer ? (
            <Link className="vd-discovery-all" href={footer.href}>
              {footer.label} <LinkArrow />
            </Link>
          ) : null}
        </nav>
        {photo ? (
          <figure className="vd-discovery-photo">
            <Image key={photo.src} src={photo.src} alt={photo.alt} fill sizes="420px" />
            {place ? (
              <Coordinates
                key={place.id + '-coordinates'}
                place={place}
                enabled={motion}
                label={arabic ? place.ar : place.name}
              />
            ) : null}
          </figure>
        ) : null}
      </div>
    </div>
  )
}
