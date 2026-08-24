import type { Locale } from '@vardenia/i18n'

/**
 * A rating, drawn.
 *
 * # Why the number is always there too
 *
 * Five shapes are a picture of a number, and a picture is worse than the number
 * for anyone using a screen reader, anyone who cannot separate gold from grey,
 * and anyone scanning a column of them. The stars are marked `aria-hidden` and
 * the text beside them is the real content. That also means a half star does
 * not have to be legible to be honest - 4.5 says 4.5.
 *
 * # Halves are rendered with a clip, not a second glyph
 *
 * A "half star" character does not exist in a way that matches the full one at
 * every size. Overlaying a clipped copy of the same shape does, and it stays
 * correct when the size changes.
 *
 * # Right to left
 *
 * The row is not mirrored. A rating scale runs low to high in both scripts, and
 * an Arabic reader shown four filled stars on the right would read it as one.
 * `dir="ltr"` on the row pins it; the text after it flows normally.
 */

function Star({ fill }: { fill: number }) {
  const id = `star-${Math.round(fill * 100)}`
  return (
    <span className="relative inline-block size-3.5">
      <svg viewBox="0 0 24 24" className="text-ink-100 absolute inset-0 size-full fill-current">
        <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2Z" />
      </svg>
      {fill > 0 ? (
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${Math.min(1, fill) * 100}%` }}
          aria-hidden
        >
          <svg
            viewBox="0 0 24 24"
            className="text-gold-500 size-3.5 max-w-none fill-current"
            key={id}
          >
            <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2Z" />
          </svg>
        </span>
      ) : null}
    </span>
  )
}

export function Stars({
  rating,
  count,
  locale,
  className = '',
}: {
  rating: number
  /** How many reviews the average is over. Omitted for a single review. */
  count?: number
  locale: Locale
  className?: string
}) {
  const clamped = Math.max(0, Math.min(5, rating))
  const shown = clamped.toFixed(1)

  const label =
    locale === 'ar'
      ? count === undefined
        ? `${shown} من 5`
        : `${shown} من 5، من ${count} تقييم`
      : count === undefined
        ? `${shown} out of 5`
        : `${shown} out of 5, from ${count} reviews`

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="inline-flex gap-0.5" dir="ltr" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} fill={clamped - i} />
        ))}
      </span>
      {/* The accessible name for the whole control, and the visible number. */}
      <span className="text-ink-700 font-mono text-xs tabular-nums" aria-label={label}>
        <span aria-hidden>
          {shown}
          {count === undefined ? null : (
            <span className="text-ink-300"> ({count})</span>
          )}
        </span>
      </span>
    </span>
  )
}
