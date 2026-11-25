'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link, usePathname } from '../../i18n/routing'

/**
 * The slim strip above the header on the home page (25 November 2026): a few
 * short messages, each a link, shown one at a time.
 *
 * - It moves on by itself every few seconds, and stops while a reader points
 *   at it or tabs into it, while the tab is in the background, and for good
 *   when the device asks for reduced motion (then only the arrows move it).
 * - The first message is in the server HTML, so the strip reads and links
 *   without JavaScript.
 * - Not closable on purpose: remembering a closed strip means drawing it and
 *   then removing it, which makes every page jump for that reader.
 */
export interface Announcement {
  /** The message, already in the reader's language. */
  text: string
  href: string
  /** Opens off the site (Linktree) in a new tab. */
  external?: boolean
}

const EVERY_MS = 5500

export function AnnouncementBar({
  items,
  label,
  previousLabel,
  nextLabel,
}: {
  items: Announcement[]
  label: string
  previousLabel: string
  nextLabel: string
}) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [still, setStill] = useState(false)
  // Only announce changes the reader asked for, never the automatic ones.
  const [asked, setAsked] = useState(false)
  const pathname = usePathname()
  const timer = useRef<number | undefined>(undefined)
  // Where a swipe started, for phones, where the arrows are hidden to give
  // the message the whole width.
  const touchX = useRef<number | null>(null)
  const count = items.length

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setStill(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (count < 2 || paused || still) return
    timer.current = window.setInterval(() => {
      if (document.visibilityState === 'visible') setIndex((i) => (i + 1) % count)
    }, EVERY_MS)
    return () => window.clearInterval(timer.current)
  }, [count, paused, still, index])

  const go = useCallback(
    (step: number) => {
      setAsked(true)
      setIndex((i) => (i + step + count) % count)
    },
    [count],
  )

  // The home page only, in every language (the owner's choice, 25 November
  // 2026). Decided on the server too, so no other page draws it and drops it.
  if (count === 0 || pathname !== '/') return null

  return (
    <section
      className="vd-announce"
      aria-label={label}
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false)
      }}
      onTouchStart={(event) => {
        touchX.current = event.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(event) => {
        const start = touchX.current
        touchX.current = null
        const end = event.changedTouches[0]?.clientX
        if (start === null || end === undefined || Math.abs(end - start) < 40 || count < 2) return
        // A swipe towards the start of the line shows the next message, in
        // either reading direction.
        const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
        go(end < start !== rtl ? 1 : -1)
      }}
    >
      {count > 1 ? (
        <button
          type="button"
          className="vd-announce-step"
          onClick={() => go(-1)}
          aria-label={previousLabel}
        >
          <ChevronLeft aria-hidden className="size-4 rtl:-scale-x-100" strokeWidth={1.5} />
        </button>
      ) : null}

      <div className="vd-announce-track" aria-live={asked ? 'polite' : 'off'}>
        {items.map((item, i) => {
          const current = i === index
          const inner = (
            <>
              <span className="vd-announce-mark" aria-hidden />
              <span>{item.text}</span>
              <ChevronRight
                aria-hidden
                className="vd-announce-arrow size-3.5 rtl:-scale-x-100"
                strokeWidth={1.75}
              />
            </>
          )
          return (
            <div
              key={item.href + i}
              className="vd-announce-item"
              data-current={current || undefined}
              aria-hidden={!current}
              role="group"
              aria-roledescription="slide"
            >
              {item.external ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  tabIndex={current ? 0 : -1}
                >
                  {inner}
                </a>
              ) : (
                <Link href={item.href} prefetch={false} tabIndex={current ? 0 : -1}>
                  {inner}
                </Link>
              )}
            </div>
          )
        })}
      </div>

      {count > 1 ? (
        <button
          type="button"
          className="vd-announce-step"
          onClick={() => go(1)}
          aria-label={nextLabel}
        >
          <ChevronRight aria-hidden className="size-4 rtl:-scale-x-100" strokeWidth={1.5} />
        </button>
      ) : null}
    </section>
  )
}
