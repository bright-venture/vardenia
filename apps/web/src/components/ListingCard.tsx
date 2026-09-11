import { useTranslations } from 'next-intl'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import type { MediaField } from '../lib/media'
import { categoryLabel, placeLabel, priceLabel } from '../lib/labels'
import { isOpenNow } from '../lib/hours'
import { Plate, Stars, Tier } from './ui'
import { SaveButton } from './SaveButton'

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
  /** The place's opening hours, for the "Open now" cue. Shape as stored. */
  openingHours?: unknown
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
 * on. So the anchor's hit area covers the whole card and a keyboard user tabs
 * through it once.
 *
 * It is a stretched link, not an anchor wrapped around everything: the anchor is
 * on the name alone and its `::after` is stretched over the card. The card also
 * carries a save button, and a button nested inside an anchor is invalid HTML
 * that behaves unpredictably; keeping the anchor small lets the heart sit beside
 * it rather than inside it, above the overlay on z-index so it takes its own
 * clicks.
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
  openingHours,
  priority = false,
  locale,
}: Props) {
  const t = useTranslations('directory')
  const price = priceLabel(priceRange)
  const place = placeLabel(governorate, district, locale)
  // Only ever shown when confidently open. `null` (no hours) and `false`
  // (closed) both render nothing: a grid of "Closed" badges is noise, and a card
  // is a reason to visit, not a warning off. Computed at render, so it carries
  // the same up-to-an-hour staleness the listing page's badge does on a cached
  // page - the accepted trade there, and the same one here.
  const open = isOpenNow(openingHours as never) === true

  return (
    // `relative` is the containing block for the stretched link below: the anchor
    // wraps only the name, but its `::after` is absolutely positioned against this
    // article and covers the whole card, so a click anywhere on it opens the
    // listing while the anchor stays small enough to hold nothing interactive.
    //
    // The focus ring is on the whole card, not the name: a stretched link is
    // keyboard-focused on its small anchor, and a ring around two words of a
    // heading is easy to miss on a grid. `has-[a:focus-visible]` moves it to the
    // card, and the anchor drops its own outline below so the two do not stack.
    <article className="has-[a:focus-visible]:outline-gold-500 group relative has-[a:focus-visible]:outline has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2">
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
              {signature ? <Tier kind="signature" /> : null}
              {verified ? <Tier kind="verified" /> : null}
            </div>
          ) : null}
        </div>

        {/*
          The heart, in the plate's end-bottom corner where the top row's
          category and tier badges never reach. It is a sibling of the card's
          link, not nested inside it - a button inside an anchor is invalid, and
          the stretched link below is what lets it sit outside one. Its `z-10`
          puts it above that anchor's `::after` overlay, so a press lands on the
          heart and a press anywhere else on the card follows the link.
        */}
        <div className="absolute bottom-3 end-3 z-10">
          <SaveButton slug={slug} name={name} />
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
          <p className="text-ink-500 font-mono text-[10px] uppercase tracking-[0.14em]">{place}</p>
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
          {/* The link is on the name and nothing else; `after:inset-0` stretches
              its hit area over the whole article (see the `relative` above). The
              anchor holds only text, so the heart can be a sibling rather than a
              button nested in a link. */}
          <Link
            href={`/directory/${slug}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {name}
          </Link>
        </h3>

        <div className="text-ink-500 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {price ? <span className="font-mono tabular-nums">{price}</span> : null}
          {typeof googleRating === 'number' && googleRating > 0 ? (
            <Stars rating={googleRating} count={googleRatingCount ?? undefined} />
          ) : null}
          {/* A status, so it takes the semantic green rather than a brand
              colour - the same call the listing page makes. */}
          {open ? (
            <span className="text-state-success inline-flex items-center gap-1.5 font-medium">
              <span aria-hidden className="bg-state-success size-1.5 rounded-full" />
              {t('openNow')}
            </span>
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
    </article>
  )
}
