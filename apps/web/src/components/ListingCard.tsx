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
      <Link href={`/directory/${slug}`} className="block">
        <div className="relative">
          <Plate image={heroImage} ratio="portrait" interactive priority={priority} />

          {/*
            The category moved onto the plate as a chip, and the tier badges sit
            at the far end of the same row.

            On the design's own cards the category is the only label above the
            fold of a grid, and it is the one a reader scans by: "hotel" or
            "restaurant" narrows a page of twenty-four far faster than a name
            does. Set on ivory so it stays legible over any photograph.

            # One flex row, not two absolutes

            They were two absolutely positioned corners, which is what the design
            draws and what breaks: at two columns on a 375px phone the card is
            about 150px wide, and "HOSPITALITY" ran straight under "VERIFIED".
            A row that spans the plate cannot overlap however narrow it gets -
            the badge keeps its size and the category truncates, which is the
            right way round because a clipped word is still readable and a
            covered one is not.
          */}
          <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start gap-2">
            <span className="bg-surface-base/95 text-ink-900 min-w-0 truncate px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]">
              {categoryLabel(category, locale)}
            </span>

            {signature || verified ? (
              <div className="ms-auto flex shrink-0 gap-1.5">
                {signature ? <Tier kind="signature" locale={locale} /> : null}
                {verified ? <Tier kind="verified" locale={locale} /> : null}
              </div>
            ) : null}
          </div>
        </div>

        {/*
          Below the plate rather than inside a bordered box. The card chrome it
          replaces - border, radius, lift and shadow on hover - made every
          listing look like a control to be clicked. The photograph is the card
          now, and the type sits under it the way a caption sits under a plate
          in print.
        */}
        <div className="mt-4">
          {place ? (
            <p className="text-ink-500 font-mono text-[10px] uppercase tracking-[0.14em]">
              {place}
            </p>
          ) : null}

          {/* `dir="auto"` on the two fields a person typed. The rest of this
              card is built from the taxonomy, which is translated, so it
              follows the page. A listing's own name and tagline fall back to
              English until translated, and a fixed direction would be wrong at
              one end or the other of that. */}
          <h3
            dir="auto"
            className="text-ink-900 group-hover:text-gold-700 mt-1.5 text-[1.4rem] leading-tight transition-colors"
          >
            {name}
          </h3>

          <div className="text-ink-500 mt-2 flex items-center gap-3 text-xs">
            {price ? <span className="font-mono tabular-nums">{price}</span> : null}
            {typeof googleRating === 'number' && googleRating > 0 ? (
              <Stars rating={googleRating} count={googleRatingCount ?? undefined} locale={locale} />
            ) : null}
          </div>

          {/*
            The design has no tagline and this keeps one, deliberately.
            Its sample data had none to show; production has them on 127
            listings, and a line saying what a place actually is helps a reader
            choose more than the tighter grid does. Clamped to two lines so it
            cannot unbalance a row. Worth putting back to the designer.
          */}
          {tagline ? (
            <p dir="auto" className="text-ink-500 mt-2 line-clamp-2 text-sm leading-relaxed">
              {tagline}
            </p>
          ) : null}

          {reference ? (
            <p className="text-ink-500 mt-3 font-mono text-[10px] tracking-[0.1em]">{reference}</p>
          ) : null}
        </div>
      </Link>
    </article>
  )
}
