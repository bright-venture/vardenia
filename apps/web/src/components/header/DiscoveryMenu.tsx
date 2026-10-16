'use client'
import Image from 'next/image'
import { useState } from 'react'
import { Link } from '../../i18n/routing'
import { Coordinates } from '../journey/Coordinates'
import { DESTINATIONS } from '../journey/destinations'
import { useJourneyMotion } from '../journey/browser-state'

export interface DiscoveryCategory {
  path: string
  name: string
  description: string
  destination: number
}

/** The links always navigate; previewing a photograph is a pointer/keyboard enhancement. */
export function DiscoveryMenu({
  title,
  body,
  items,
  arabic,
  directoryLabel,
}: {
  title: string
  body: string
  items: DiscoveryCategory[]
  arabic: boolean
  directoryLabel: string
}) {
  const [active, setActive] = useState(0)
  const [motion] = useJourneyMotion()
  const place = DESTINATIONS[items[active]?.destination ?? 0] ?? DESTINATIONS[0]
  return (
    <div className="vd-discovery-menu">
      <header className="vd-discovery-heading">
        <h2 id="vd-discovery-title">{title}</h2>
        <p>{body}</p>
      </header>
      <div className="vd-discovery-composition">
        <nav aria-labelledby="vd-discovery-title">
          <ul>
            {items.map((item, index) => (
              <li key={item.path} data-active={active === index}>
                <Link
                  href={`/${item.path}`}
                  onPointerEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <span>{item.description}</span>
                  </span>
                  <span className="vd-discovery-arrow" aria-hidden>
                    ↗
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link className="vd-discovery-all" href="/directory">
            {directoryLabel} ↗
          </Link>
        </nav>
        <figure className="vd-discovery-photo">
          <Image
            key={place.id}
            src={`/journey/${place.image}`}
            alt={place.alt}
            fill
            sizes="420px"
          />
          <Coordinates
            key={place.id + '-coordinates'}
            place={place}
            enabled={motion}
            label={arabic ? place.ar : place.name}
          />
        </figure>
      </div>
    </div>
  )
}
