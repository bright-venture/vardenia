import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import type { MediaField } from '../lib/media'
import { categoryLabel, placeLabel, priceLabel } from '../lib/labels'
import { Plate, Stars, Tier } from './ui'

interface Props {
  slug: string
  name: string
  tagline?: string | null
  category?: string | null
  governorate?: string | null
  district?: string | null
  priceRange?: string | number | null
  verified?: boolean | null
  /** Top commercial tier. Separate from `verified` on purpose - see ui/Tier. */
  signature?: boolean | null
  heroImage?: MediaField
  /**
   * The place's Google rating, copied in by staff.
   *
   * Named for its source rather than called `rating`, because the name is what
   * stops it being treated as ours somewhere down the line. It is always drawn
   * with the word Google beside it - see ui/Stars.
   */
  googleRating?: number | null
  googleRatingCount?: number | null
  /** Reference code, printed under the QR on the page this listing appears on. */
  reference?: string | null
  /** Set on the first card above the fold so its image preloads. */
  priority?: boolean
  locale: Locale
}

/**
 * One listing in a grid.
 *
 * # The whole card is the link
 *
 * A card with a linked heading and an unlinked image gives a reader two targets
 * where they perceive one, and on a phone the image is the part a thumb lands
 * on. One anchor wrapping everything is also the only version that a keyboard
 * user tabs through once rather than twice.
 *
 * # What is on it, and why in this order
 *
 * Category, then name, then place, then price, then the marks. That is the
 * order somebody scanning a grid actually reads: what kind of thing, what it is
 * called, whether it is near them, whether they can afford it. The tier badges
 * sit on the image because they qualify the listing as a whole rather than any
 * one line of it.
 *
 * The reference code is set in mono at the bottom because every listing here has
 * a printed twin, and a catalogue number is the cue that says so.
 *
 * # Verified is a tick, not a colour
 *
 * The old version marked verification with a gold tick character beside the
 * name. That is invisible to anyone who cannot distinguish it and ambiguous to
 * everyone else. It is now a labelled badge with its own text.
 */
export function ListingCard({
  slug,
  name,
  tagline,
  category,
  governorate,
  district,
  priceRange,
  verified,
  signature,
  heroImage,
  googleRating,
  googleRatingCount,
  reference,
  priority = false,
  locale,
}: Props) {
  const price = priceLabel(priceRange)
  const place = placeLabel(governorate, district, locale)

  return (
    <article className="group">
      <Link
        href={`/directory/${slug}`}
        className="border-ink-100 hover:border-ink-300 flex h-full flex-col overflow-hidden rounded-lg border transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-[0_2px_4px_rgba(16,26,29,0.06),0_24px_48px_-16px_rgba(16,26,29,0.18)]"
      >
        <div className="relative">
          <Plate image={heroImage} ratio="card" interactive priority={priority} />

          {signature || verified ? (
            <div className="absolute start-3 top-3 flex gap-1.5">
              {signature ? <Tier kind="signature" locale={locale} /> : null}
              {verified ? <Tier kind="verified" locale={locale} /> : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <p className="text-ink-300 font-mono text-[10px] uppercase tracking-[0.12em]">
            {categoryLabel(category, locale)}
          </p>

          <div className="flex items-start justify-between gap-3">
            <h3 className="text-ink-900 text-lg leading-snug">{name}</h3>
            {price ? (
              <span className="text-gold-700 shrink-0 pt-0.5 font-mono text-sm tabular-nums">
                {price}
              </span>
            ) : null}
          </div>

          {place ? <p className="text-ink-500 text-sm">{place}</p> : null}

          {tagline ? (
            <p className="text-ink-500 line-clamp-2 text-sm leading-relaxed">{tagline}</p>
          ) : null}

          {typeof googleRating === 'number' && googleRating > 0 ? (
            <div className="mt-1">
              <Stars rating={googleRating} count={googleRatingCount ?? undefined} locale={locale} />
            </div>
          ) : null}

          {reference ? (
            <p className="text-ink-300 mt-auto pt-3 font-mono text-[10px] tracking-[0.1em]">
              {reference}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  )
}
