import type { ReactNode } from 'react'
import { Link } from '../i18n/routing'

/**
 * One filter, as a link.
 *
 * A link and not a button, because every filtered view has to be a real URL:
 * shareable, indexable, and printable next to a QR code. That is the whole
 * reason the directory filters through the query string rather than through
 * client state.
 *
 * `aria-current` rather than styling alone, so the selected filter is announced
 * and not merely darker.
 */
export function FilterChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={
        active
          ? 'bg-ink-900 text-surface-base rounded-full px-4 py-2 text-sm'
          : 'border-ink-100 text-ink-700 hover:border-ink-300 rounded-full border px-4 py-2 text-sm transition-colors'
      }
    >
      {children}
    </Link>
  )
}
