import Image from 'next/image'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { resolveImage, type MediaField } from '../lib/media'
import { categoryLabel, placeLabel, priceLabel } from '../lib/labels'

interface Props {
  slug: string
  name: string
  tagline?: string | null
  category?: string | null
  governorate?: string | null
  district?: string | null
  priceRange?: string | number | null
  verified?: boolean | null
  heroImage?: MediaField
  locale: Locale
}

/**
 * Matches `directory.verified` in the message catalogues.
 *
 * Written out rather than read through `getTranslations`, because this is a
 * synchronous component that already takes `locale` - the same approach as
 * OpeningHoursTable and lib/labels. What it must not be is what it was: the
 * English string, hardcoded, on a site half its readers use in Arabic.
 */
const verifiedLabel = (locale: Locale) =>
  locale === 'ar' ? 'موثّق من فاردينيا' : 'Verified by Vardenia'

export function ListingCard({
  slug,
  name,
  tagline,
  category,
  governorate,
  district,
  priceRange,
  verified,
  heroImage,
  locale,
}: Props) {
  const image = resolveImage(heroImage, 'card')
  const price = priceLabel(priceRange)
  const place = placeLabel(governorate, district, locale)

  return (
    <article className="border-ink-100 hover:border-ink-300 group overflow-hidden rounded-lg border transition-colors">
      <Link href={`/directory/${slug}`} className="block focus-visible:outline-none">
        <div className="bg-surface-sunken relative aspect-[4/3] overflow-hidden">
          {image ? (
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-1 p-4">
          <p className="text-ink-300 text-xs uppercase tracking-widest">
            {categoryLabel(category, locale)}
          </p>
          <h3 className="font-display text-ink-900 text-xl leading-snug">
            {name}
            {/* The tick is the whole badge, so its label is the only thing a
                screen reader has to go on - and `title` alone is both English
                and unreliably announced. `role="img"` with an aria-label makes
                it a labelled graphic rather than a stray character. */}
            {verified ? (
              <span
                className="text-gold-700 ms-2 align-middle text-xs"
                role="img"
                title={verifiedLabel(locale)}
                aria-label={verifiedLabel(locale)}
              >
                &#10003;
              </span>
            ) : null}
          </h3>
          {tagline ? <p className="text-ink-500 line-clamp-2 text-sm">{tagline}</p> : null}
          <p className="text-ink-300 mt-1 text-xs">
            {place}
            {price ? <span className="ms-2 tabular-nums">{price}</span> : null}
          </p>
        </div>
      </Link>
    </article>
  )
}
