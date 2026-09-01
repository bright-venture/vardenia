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
  showSource = true,
}: {
  rating: number
  /** How many ratings the average is over. Omitted when it is not known. */
  count?: number
  locale: Locale
  className?: string
  /**
   * Show "Google" beside the stars.
   *
   * Defaults to true, and turning it off should be rare. This number was
   * copied from Google; it is not a rating Vardenia collected and not a verdict
   * Vardenia formed. Unattributed on a listing page it reads as ours, which is
   * a claim we have not earned. The only reason to hide it is when the
   * surrounding text already says where it came from.
   */
  showSource?: boolean
}) {
  const clamped = Math.max(0, Math.min(5, rating))
  const shown = clamped.toFixed(1)
  const ar = locale === 'ar'

  /**
   * The accessible name says the source too.
   *
   * A sighted reader gets the attribution from the word beside the stars. A
   * listener would otherwise hear "4.5 out of 5" with no idea who said so,
   * which is the one piece of context that changes what the number means.
   */
  const source = ar ? 'على غوغل' : 'on Google'

  const base = ar ? `${shown} من 5` : `${shown} out of 5`
  const withCount =
    count === undefined
      ? base
      : ar
        ? `${base}، من ${count} تقييم`
        : `${base}, from ${count} ratings`

  const label = showSource ? `${withCount} ${source}` : withCount

  return (
    /**
     * `role="img"` carries the label, and it is load-bearing rather than tidy.
     *
     * An `aria-label` on a bare span is ignored: a span has the implicit role
     * `generic`, and ARIA does not let a generic element take a name. The first
     * version of this put the label on a plain span and hid every piece of
     * visible content inside it, so a screen reader announced nothing at all
     * for the rating - worse than the bare number it replaced.
     *
     * With an explicit role the element can be named, and the whole thing reads
     * as one graphic saying "4.5 out of 5, from 12 reviews" rather than as five
     * unlabelled shapes.
     */
    <span role="img" aria-label={label} className={`inline-flex items-center gap-2 ${className}`}>
      <span className="inline-flex gap-0.5" dir="ltr" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} fill={clamped - i} />
        ))}
      </span>
      <span className="text-ink-700 font-mono text-xs tabular-nums" aria-hidden>
        {shown}
        {count === undefined ? null : <span className="text-ink-500"> ({count})</span>}
      </span>
      {showSource ? (
        <span className="text-ink-300 text-[11px]" aria-hidden>
          {source}
        </span>
      ) : null}
    </span>
  )
}
