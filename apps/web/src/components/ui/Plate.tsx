import Image from 'next/image'
import { resolveImage, type MediaField } from '../../lib/media'

/**
 * An image slot that looks deliberate before there is an image in it.
 *
 * # Why this exists
 *
 * Photography has not been shot. Every card, hero and section header on the
 * site therefore renders with nothing in its image slot, and the honest default
 * - a grey box - makes a finished page look broken. Worse, a slot with no
 * intrinsic size collapses to nothing, so the layout reflows the day the
 * pictures arrive and every page has to be checked again.
 *
 * A plate solves both. The ratio is locked whether or not there is a file, so
 * nothing moves later. The empty state is drawn rather than absent: a cedar
 * hatch at low opacity with a hairline frame, which reads as reserved space
 * rather than as a failure.
 *
 * # The ratios are fixed on purpose
 *
 * Four of them, named after where they are used, because a directory whose
 * cards are each a different shape looks like a scrape. `card` is 4:3, `hero`
 * is 3:2, `band` is 21:9 for the strip across a section header, and `square`
 * is for an avatar or a logo. A caller cannot pass an arbitrary aspect ratio,
 * which is the point.
 *
 * # `priority` is not decorative
 *
 * The one plate above the fold on a page should preload; the twenty below it
 * must not, or they compete with the fold for bandwidth on a phone. Callers
 * opt in per page rather than getting a default that is wrong somewhere.
 */

const RATIOS = {
  card: 'aspect-[4/3]',
  hero: 'aspect-[3/2]',
  band: 'aspect-[21/9]',
  square: 'aspect-square',
} as const

export type PlateRatio = keyof typeof RATIOS

/** Which stored size to ask for, per slot. Avoids handing a card a 2000px hero. */
const PREFERRED = {
  card: 'card',
  hero: 'hero',
  band: 'hero',
  square: 'thumbnail',
} as const

interface Props {
  image?: MediaField
  ratio?: PlateRatio
  /** Rendered width hints for the browser. Defaults suit a three-column grid. */
  sizes?: string
  priority?: boolean
  /** Zoom on hover. Only for slots inside a link; static headers should not move. */
  interactive?: boolean
  className?: string
  /**
   * Overrides the alt text from the media document.
   *
   * Only pass this when the surrounding text does not already name the subject.
   * A card whose heading is the business name does not need the image to repeat
   * it, and an empty alt is correct for an image that adds nothing a screen
   * reader has not already been told.
   */
  alt?: string
}

export function Plate({
  image,
  ratio = 'card',
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  priority = false,
  interactive = false,
  className = '',
  alt,
}: Props) {
  const resolved = resolveImage(image, PREFERRED[ratio])

  return (
    <div
      className={`bg-surface-sunken relative overflow-hidden ${RATIOS[ratio]} ${className}`}
      // The hatch is inline because it is one gradient used in one place, and
      // a Tailwind arbitrary value for it would be less readable than this.
      style={
        resolved
          ? undefined
          : {
              // cedar.900 at three alphas, written out because a gradient stop
              // cannot take a colour class. Update it with the palette - this
              // held the old #10302a through the 2026 rebrand and tinted every
              // photograph-less card green on an otherwise navy site.
              backgroundImage:
                'repeating-linear-gradient(-45deg, rgba(11,23,57,0.05) 0 10px, transparent 10px 20px), linear-gradient(160deg, rgba(11,23,57,0.09), rgba(11,23,57,0.03))',
            }
      }
    >
      {resolved ? (
        <Image
          src={resolved.src}
          alt={alt ?? resolved.alt}
          fill
          sizes={sizes}
          priority={priority}
          className={
            interactive
              ? 'object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]'
              : 'object-cover'
          }
        />
      ) : (
        /* Decorative. A reader who cannot see it is told nothing useful by
           "placeholder", and the heading beside it already names the subject. */
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-ink-300 group-hover:text-gold-500 absolute inset-0 m-auto size-7 transition-colors duration-500"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-4.6-4.6a2 2 0 0 0-2.8 0L3 21" />
        </svg>
      )}
    </div>
  )
}
