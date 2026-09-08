'use client'

/**
 * The one-tap way back to the shortlist, in the header.
 *
 * A heart with a count, shown only to a signed-in reader: a signed-out one has
 * nothing saved and already has a sign-in link beside this, so a second "Saved"
 * would be noise. It reads its count and its sign-in state from the same
 * SavedProvider every heart on the page uses, so saving a place on a card ticks
 * this up without a reload.
 *
 * A small client island in an otherwise server-rendered header. That is the cost
 * of a per-reader count; everything around it stays static, which is what keeps
 * the header off the critical path. See components/SiteHeader.
 */

import { Heart } from 'lucide-react'
import { Link } from '../i18n/routing'
import { useSaved } from './SavedProvider'

export function SavedNavLink({ label }: { label: string }) {
  const { signedIn, count } = useSaved()

  // Nothing until we know they are signed in: not for a signed-out reader, and
  // not in the moment before the first GET answers, when it would flash in.
  if (signedIn !== true) return null

  return (
    <Link
      href="/account/saved"
      aria-label={count > 0 ? `${label} (${count})` : label}
      title={label}
      className="text-ink-700 hover:text-ink-900 relative p-1.5 transition-colors"
    >
      <Heart size={16} strokeWidth={1.75} aria-hidden />
      {count > 0 ? (
        <span
          aria-hidden
          className="bg-gold-700 text-surface-base absolute -end-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none"
        >
          {count}
        </span>
      ) : null}
    </Link>
  )
}
