'use client'
import { LinkArrow } from '../LinkArrow'
import Image from 'next/image'
import { useId, useState } from 'react'
import { useLocale } from 'next-intl'
import { Link, usePathname } from '../../i18n/routing'
import { useDesktopEdition } from '../editorial/useDesktopEdition'
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
  /** A small label beside the name, such as "Coming soon" (25 November 2026). */
  badge?: string
  destination?: number
  /**
   * `whole` shows the picture uncropped on the panel's paper, for a cut-out
   * object such as the magazine spread, whose page edges and text the
   * photograph crop cut off.
   */
  photo?: { src: string; alt: string; whole?: boolean }
}

/**
 * Shared header panel. Category and company menus use compact text links;
 * editorial menus may show their actual artwork beside the list.
 *
 * The links always navigate; previewing a photograph is a pointer/keyboard
 * enhancement.
 */
export function DiscoveryMenu({
  title,
  body,
  items,
  footer,
  layout = 'editorial',
}: {
  title: string
  body: string
  items: DiscoveryCategory[]
  /** A link under the list, such as the whole directory. */
  footer?: { href: string; label: string }
  /** Category/company menus use compact links; editorial artwork stays optional. */
  layout?: 'links' | 'editorial'
}) {
  const pathname = usePathname()
  const locale = useLocale()
  const desktop = useDesktopEdition(locale)
  const links = footer ? [...items, footer] : items
  const current = desktop
    ? links
        .filter(({ href }) => pathname === href || pathname.startsWith(href + '/'))
        .sort((a, b) => b.href.length - a.href.length)[0]?.href
    : undefined
  const currentState = (href: string) =>
    href === current ? (pathname === href ? 'page' : 'location') : undefined
  const [active, setActive] = useState<number | null>(null)
  // Three of these sit in the header at once, so the heading id is per menu.
  const headingId = useId()
  const currentItem = items.find((entry) => entry.href === current)
  const item = (active === null ? currentItem : items[active]) ?? items[0]
  const place = item?.photo ? null : (DESTINATIONS[item?.destination ?? 0] ?? DESTINATIONS[0])
  const photo = item?.photo ?? (place ? { src: `/journey/${place.image}`, alt: place.alt } : null)
  return (
    <div
      className="vd-discovery-menu"
      data-layout={desktop ? layout : 'editorial'}
      data-count={items.length}
    >
      <header className="vd-discovery-heading">
        <h2 id={headingId}>{title}</h2>
        <p>{body}</p>
      </header>
      <div className="vd-discovery-composition">
        <nav aria-labelledby={headingId}>
          <ul>
            {items.map((entry, index) => (
              <li key={entry.href} data-active={entry === item}>
                <Link
                  href={entry.href}
                  aria-current={currentState(entry.href)}
                  onPointerEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                >
                  <span>
                    <strong>
                      {entry.name}
                      {entry.badge ? <span className="vd-soon-badge">{entry.badge}</span> : null}
                    </strong>
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
            <Link
              className="vd-discovery-all"
              href={footer.href}
              aria-current={currentState(footer.href)}
            >
              {footer.label} <LinkArrow />
            </Link>
          ) : null}
        </nav>
        {(!desktop || layout === 'editorial') && photo ? (
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
