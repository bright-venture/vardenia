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
    }
  }, [])
  return (
    <details
      ref={root}
      className="vd-mobile-menu"
      onClick={(event) => {
        if ((event.target as Element).closest('a')) {
          if (root.current) root.current.open = false
        }
      }}
    >
      <summary
        aria-label={label}
        className="text-ink-700 flex cursor-pointer list-none items-center gap-2 text-sm"
      >
        <span className="flex flex-col gap-[3px]" aria-hidden>
          <span className="bg-ink-700 block h-[1.5px] w-5" />
          <span className="bg-ink-700 block h-[1.5px] w-5" />
          <span className="bg-ink-700 block h-[1.5px] w-5" />
        </span>
        <span className="sr-only">{label}</span>
      </summary>
      {children}
    </details>
  )
}
