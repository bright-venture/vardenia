import type { ReactNode } from 'react'

/**
 * Long-form body copy.
 *
 * The styles live in `globals.css` under `.prose-vardenia`, scoped to that one
 * class so text rendered from the CMS can never restyle the rest of the page.
 * This wrapper exists so a page asks for "prose" rather than remembering a
 * class name, and so the measure is applied consistently.
 *
 * # Why the measure is capped
 *
 * A line of body text longer than about 70 characters is measurably harder to
 * track back from - the eye loses the start of the next line. Editorial pages
 * on this site are read, not scanned, so the cap is real rather than
 * decorative. `narrow` tightens it further for a legal document, which is read
 * slowly and in short bursts.
 */
export function Prose({
  children,
  narrow = false,
  className = '',
}: {
  children: ReactNode
  narrow?: boolean
  className?: string
}) {
  return (
    <div className={`prose-vardenia ${narrow ? 'max-w-[58ch]' : 'max-w-[68ch]'} ${className}`}>
      {children}
    </div>
  )
}
