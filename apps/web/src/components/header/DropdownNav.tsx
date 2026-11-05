'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { usePathname } from '../../i18n/routing'

/** Native disclosure works without scripts; hover is an optional enhancement. */
export function DropdownNav({
  label,
  children,
  align = 'start',
  wide = false,
}: {
  label: string
  children: ReactNode
  align?: 'start' | 'end'
  wide?: boolean
}) {
  const root = useRef<HTMLDetailsElement>(null)
  const panelId = useId()
  const pathname = usePathname()

  useEffect(() => {
    if (root.current) root.current.open = false
  }, [pathname])

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) root.current.open = false
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])

  const closePeers = () => {
    document
      .querySelectorAll<HTMLDetailsElement>('details[data-vd-desktop-dropdown][open]')
      .forEach((peer) => {
        if (peer === root.current) return
        const summary = peer.querySelector('summary')
        if (peer.contains(document.activeElement) && document.activeElement !== summary) {
          summary?.focus({ preventScroll: true })
        }
        peer.open = false
      })
  }

  return (
    <details
      ref={root}
      name="vd-desktop-navigation"
      data-vd-desktop-dropdown
      className={wide ? 'vd-discovery-dropdown group' : 'group relative'}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse' && root.current) {
          closePeers()
          root.current.open = true
        }
      }}
      onPointerLeave={() => {
        if (root.current && !root.current.contains(document.activeElement))
          root.current.open = false
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          event.currentTarget.open = false
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && event.currentTarget.open) {
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.open = false
          event.currentTarget.querySelector('summary')?.focus({ preventScroll: true })
        }
      }}
      onClick={(event) => {
        if ((event.target as Element).closest('a') && root.current) root.current.open = false
      }}
    >
      <summary
        onClick={() => {
          if (!root.current?.open) closePeers()
        }}
        aria-controls={panelId}
        className="text-ink-700 hover:text-ink-900 group-open:text-ink-900 flex h-full cursor-pointer list-none items-center gap-1 px-2 py-1.5 text-sm transition-colors [&::-webkit-details-marker]:hidden"
      >
        {label}
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="h-3 w-3 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </summary>

      {/* Padding bridges trigger and panel, so pointer travel has no dead gap. */}
      <div
        id={panelId}
        className={`absolute top-full z-50 pt-3 ${align === 'end' ? 'end-0' : 'start-0'}`}
      >
        <div className={wide ? 'vd-discovery-panel' : 'vd-editorial-panel'}>{children}</div>
      </div>
    </details>
  )
}
