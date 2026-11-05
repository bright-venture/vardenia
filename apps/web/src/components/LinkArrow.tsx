import { ArrowUpRight } from 'lucide-react'

/** Decorative internal-navigation mark; mirrors with reading direction.
 * Use an external-link icon instead when indicating an off-site destination.
 * SVG avoids platform-dependent arrow-font fallback. */
export function LinkArrow() {
  return (
    <ArrowUpRight
      aria-hidden="true"
      focusable="false"
      width="1em"
      height="1em"
      className="inline-block shrink-0 align-middle rtl:-scale-x-100"
    />
  )
}
