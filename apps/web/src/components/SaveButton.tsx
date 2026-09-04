'use client'

/**
 * The heart. A press saves the listing, or unsaves it, or sends a signed-out
 * reader to sign in first. All of that lives in the provider; this is only the
 * control and its two shapes.
 *
 * `icon` sits over a card image while browsing, which is where saving mostly
 * happens. `button` is the labelled action on the listing page itself. Both read
 * their saved state and their words from the one provider, so a save made on a
 * card is already reflected on the page and the other way round.
 */

import type { MouseEvent } from 'react'
import { Heart } from 'lucide-react'
import { useSaved } from './SavedProvider'

export function SaveButton({
  slug,
  variant = 'icon',
}: {
  slug: string
  variant?: 'icon' | 'button'
}) {
  const { isSaved, toggle, labels } = useSaved()
  const saved = isSaved(slug)
  const text = saved ? labels.saved : labels.save

  // The card wraps the whole plate in a link; the heart must not follow it.
  const handle = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    toggle(slug)
  }

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={handle}
        aria-pressed={saved}
        className={`focus-visible:outline-gold-500 inline-flex items-center justify-center gap-2 border px-6 py-3.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
          saved
            ? 'border-gold-700 bg-gold-700 text-surface-base'
            : 'border-ink-100 text-ink-900 hover:border-gold-700 hover:text-gold-700'
        }`}
      >
        <Heart size={16} fill={saved ? 'currentColor' : 'none'} aria-hidden />
        {text}
      </button>
    )
  }

  // No positioning here: the caller places it (a card puts it in a corner of the
  // plate). It only needs its own pointer events back, since the overlays it sits
  // among are `pointer-events-none`.
  return (
    <button
      type="button"
      onClick={handle}
      aria-pressed={saved}
      aria-label={text}
      title={text}
      className={`bg-surface-base/85 focus-visible:outline-gold-500 pointer-events-auto inline-flex size-9 items-center justify-center rounded-full backdrop-blur transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        saved ? 'text-gold-700' : 'text-ink-700 hover:text-gold-700'
      }`}
    >
      <Heart size={17} fill={saved ? 'currentColor' : 'none'} aria-hidden />
    </button>
  )
}
