'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname } from '../../i18n/routing'

/** Native disclosure, with dismissal after navigation, outside taps and Escape. */
export function MobileMenu({ label, children }: { label: string; children: ReactNode }) {
  const root = useRef<HTMLDetailsElement>(null)
  const pathname = usePathname()
  useEffect(() => {
    if (root.current) root.current.open = false
  }, [pathname])
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) root.current.open = false
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && root.current?.open) {
        root.current.open = false
        root.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      document.documentElement.classList.remove('vd-menu-open')
    }
  }, [])
  return (
    <details
      ref={root}
      className="vd-mobile-menu"
      // The menu is a full-screen sheet on a phone: the page behind it must not
      // scroll under the reader's thumb. Cleared on every close, including the
      // one that follows a navigation.
      onToggle={(event) => {
        document.documentElement.classList.toggle('vd-menu-open', event.currentTarget.open)
      }}
      onClick={(event) => {
        if ((event.target as Element).closest('a')) {
          if (root.current) root.current.open = false
        }
      }}
    >
      <summary
        aria-label={label}
        className="text-ink-900 flex cursor-pointer list-none items-center text-sm"
      >
        {/* Three even lines in the wordmark's ink; the outer two cross into a
            close mark while the menu is open (home-finish.css, .vd-menu-icon). */}
        <span className="vd-menu-icon" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="sr-only">{label}</span>
      </summary>
      {children}
    </details>
  )
}
