import { useTranslations } from 'next-intl'

/**
 * A rating, drawn.
 *
 * # Whose rating
 *
 * Vardenia's own, and only ever that. These stars used to carry a Google
 * rating copied in by staff, with the word Google beside them so it could not
 * be mistaken for a verdict we had formed. That number is gone from the product
 * and the attribution went with it: what this draws now is the average of
 * moderated guest reviews, which is ours to state plainly.
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

/**
 * The two grounds this can land on.
 *
 * `gold.500` is the fill on ivory and all but disappears on navy, which is the
 * same reason ui/Rule switches to `gold.300` over the cedar ground. The unfilled
 * track has to flip outright rather than fade: `ink.100` is a light grey, so on
 * navy it reads as a *filled* star and a 3.5 would look like a 5.
 */
const TONES = {
  light: {
    track: 'text-ink-100',
    fill: 'text-gold-500',
    value: 'text-ink-700',
    muted: 'text-ink-500',
  },
  inverse: {
    track: 'text-cedar-100/25',
    fill: 'text-gold-300',
    value: 'text-surface-base',
    muted: 'text-cedar-100/70',
  },
} as const

function Star({ fill, tone }: { fill: number; tone: (typeof TONES)[keyof typeof TONES] }) {
  const id = `star-${Math.round(fill * 100)}`
  return (
    <span className="relative inline-block size-3.5">
      <svg viewBox="0 0 24 24" className={`${tone.track} absolute inset-0 size-full fill-current`}>
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
            className={`${tone.fill} size-3.5 max-w-none fill-current`}
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
  className = '',
  inverse = false,
}: {
  rating: number
  /** How many ratings the average is over. Omitted when it is not known. */
  count?: number
  className?: string
  /** Set on the cedar ground, where the ink greys are invisible. See TONES. */
  inverse?: boolean
}) {
  const t = useTranslations()
  const clamped = Math.max(0, Math.min(5, rating))
  const shown = clamped.toFixed(1)
  const tone = inverse ? TONES.inverse : TONES.light

  const label =
    count === undefined
      ? t('stars.rating', { rating: shown })
      : t('stars.ratingCount', { rating: shown, count })

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
          <Star key={i} fill={clamped - i} tone={tone} />
        ))}
      </span>
      <span className={`${tone.value} font-mono text-xs tabular-nums`} aria-hidden>
        {shown}
        {count === undefined ? null : <span className={tone.muted}> ({count})</span>}
      </span>
    </span>
  )
}
