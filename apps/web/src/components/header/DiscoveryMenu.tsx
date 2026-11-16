'use client'
import { LinkArrow } from '../LinkArrow'
import Image from 'next/image'
import { useId, useState } from 'react'
import { Link } from '../../i18n/routing'
import { DESTINATIONS } from '../journey/destinations'

/**
 * One row of a large header menu: a name in the display face, a line saying
 * what is behind it, and the photograph shown beside the list while it is
 * pointed at or focused.
 *
 * The photograph is either one of the journey's destinations, by index into
 * DESTINATIONS, or a photograph of the row's own (the magazine's spread). Both
 * are shown plain: the coordinates card the destinations used to carry was
 * taken off on 10 November 2026.
 */
export interface DiscoveryCategory {
  href: string
  name: string
  description: string
  destination?: number
  /**
   * `whole` shows the picture uncropped on the panel's paper, for a cut-out
   * object such as the magazine spread, whose page edges and text the
   * photograph crop cut off.
   */
  photo?: { src: string; alt: string; whole?: boolean }
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
  footer,
}: {
  title: string
  body: string
  items: DiscoveryCategory[]
  /** A link under the list, such as the whole directory. */
  footer?: { href: string; label: string }
}) {
  const [active, setActive] = useState(0)
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
          <figure
            className="vd-discovery-photo"
            data-whole={'whole' in photo && photo.whole ? 'true' : undefined}
          >
            <Image key={photo.src} src={photo.src} alt={photo.alt} fill sizes="520px" />
          </figure>
        ) : null}
      </div>
    </div>
  )
}
