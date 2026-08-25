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
 *
 * # One dark, not two
 *
 * The selected chip used to be `ink-900`, near-black, sitting in the same row
 * as a cedar Filters button. Two different darks a few pixels apart read as two
 * unrelated controls rather than one bar. Cedar is the brand ground; the chip
 * uses it.
 *
 * # Fixed height and no wrapping
 *
 * `py-2` let the box grow when a label broke over two lines, so "All of
 * Lebanon" and "Baalbek-Hermel" were visibly taller than "Akkar" and the row
 * came out ragged. A fixed height with `whitespace-nowrap` keeps every chip the
 * same size; the row already scrolls sideways, so there is nothing to gain by
 * letting a label wrap.
 *
 * # The count
 *
 * Optional, because only the governorate row has one. It is rendered inside the
 * chip rather than after it so the two never separate across a scroll, and in
 * `tabular-nums` so the chips do not shift width as the numbers change.
 */
export function FilterChip({
  href,
  active,
  count,
  children,
}: {
  href: string
  active: boolean
  /** How many results this filter would give, if that is known. */
  count?: number
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={
        active
          ? 'bg-cedar-900 text-surface-base inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm'
          : 'border-ink-100 text-ink-700 hover:border-ink-300 hover:bg-surface-raised inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm transition-colors'
      }
    >
      {children}
      {/*
        Zero is shown rather than hidden. A governorate with nothing in it is
        exactly the case this exists to warn about, and hiding the number there
        would leave the chip looking like every other one.
      */}
      {typeof count === 'number' ? (
        <span
          className={`font-mono text-[11px] tabular-nums ${
            active ? 'opacity-70' : count === 0 ? 'text-ink-300' : 'text-ink-500'
          }`}
        >
          {count}
        </span>
      ) : null}
    </Link>
  )
}
