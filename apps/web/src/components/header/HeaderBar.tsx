'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * The bar itself: transparent over the top of a page, solid once it is scrolled.
 *
 * The effect is small and does a specific job. The header is sticky, so at rest
 * it sits over the hero image; a permanent white band across the top of every
 * page is the thing that makes a site look like a template. Below ten pixels of
 * scroll there is nothing behind it to blur, so it stays clear and the page
 * starts at the top of the screen rather than under a rule.
 *
 * # Why this is the only client component in the header
 *
 * Scroll position exists nowhere but the browser. Everything else - the links,
 * the menus, the labels - is rendered on the server and stays static, which is
 * what keeps the prerendered pages prerendered. This wraps them without needing
 * to know what they are.
 *
 * # It degrades to the solid bar
 *
 * If the script never runs, `scrolled` stays false and the header is
 * transparent, which is correct at the top of the page - where a reader without
 * JavaScript also starts. Scrolling then gives them a transparent bar over
 * content, so the fallback carries its own background rather than relying on the
 * blur landing.
 */
export function HeaderBar({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)

    onScroll()
    // `passive` because this never calls preventDefault, and saying so lets the
    // browser keep scrolling smooth instead of waiting on the handler.
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      data-scrolled={scrolled ? 'true' : 'false'}
      className={[
        'sticky top-0 z-50 w-full border-b transition-colors duration-300',
        scrolled
          ? 'border-ink-100 bg-surface-base/85 supports-[backdrop-filter]:bg-surface-base/70 backdrop-blur-lg'
          : 'bg-surface-base/95 border-transparent supports-[backdrop-filter]:bg-transparent',
      ].join(' ')}
    >
      {children}
    </header>
  )
}
