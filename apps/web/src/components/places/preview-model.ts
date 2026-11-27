/**
 * The page shape, in one place. A4 portrait for now; set the real book's
 * ratio here and every magazine page follows.
 */
export const PAGE_RATIO = '210 / 297'

/** Hard limits so typed text fits the page; the page cards also line-clamp. */
export const DESCRIPTION_MAX = 600
export const NAME_MAX = 60
export const TAGLINE_MAX = 90

/**
 * Trim, then cut to `max` characters (ellipsis included). Counts code points so
 * an emoji or astral character is never split in half.
 */
export function clampText(text: string, max: number): string {
  const trimmed = text.trim()
  const chars = Array.from(trimmed)
  if (chars.length <= max) return trimmed
  return (
    chars
      .slice(0, max - 1)
      .join('')
      .trimEnd() + '\u2026'
  )
}

/** Page height in cqw, derived from PAGE_RATIO ("210 / 297"). */
export const PAGE_HEIGHT = (() => {
  const [w, h] = PAGE_RATIO.split('/').map((n) => Number(n.trim()))
  return (100 * h!) / w!
})()

/** Inline equivalent of Tailwind's line-clamp-N, so the count has one source. */
export function clampStyle(lines: number): React.CSSProperties {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  }
}
