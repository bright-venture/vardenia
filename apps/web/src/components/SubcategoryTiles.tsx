import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { subcategoryLabel } from '../lib/labels'

/**
 * The choice a section page opens on.
 *
 * # Why a section does not open on listings
 *
 * "Stay" held hotels, guesthouses, chalets, apart-hotels, mountain resorts,
 * beach resorts and private villas in one undifferentiated grid, ordered by
 * tier. Somebody looking for a chalet in the mountains was shown a city hotel
 * first and had to notice a row of filter chips above it to do anything about
 * it. The kind of place is the first question a reader actually has, so it is
 * asked first rather than offered as a refinement.
 *
 * The filters are still there once a choice is made, and location is the second
 * question - which is the order people ask them in.
 *
 * # Why the counts are on the tiles
 *
 * A tile that leads nowhere is a dead end we sent the reader into, and an empty
 * subcategory is common in a catalogue still being filled. Anything with nothing
 * in it is dropped from the row outright; everything else says how much is
 * behind it before the click rather than after.
 */
export async function SubcategoryTiles({
  base,
  subcategories,
  counts,
  locale,
  total,
}: {
  /** The section's own path, e.g. `/stay`. */
  base: string
  subcategories: readonly { slug: string }[]
  counts: Record<string, number>
  locale: Locale
  /** Listings in the whole section, for the "everything" tile. */
  total: number
}) {
  const t = await getTranslations('directory')

  // An empty subcategory is a dead end, so it is not offered at all.
  const offered = subcategories.filter((sub) => (counts[sub.slug] ?? 0) > 0)

  // Nothing to choose between is not a choice. One subcategory, or none with
  // anything in it, and the page is better off going straight to the listings.
  if (offered.length < 2) return null

  return (
    <nav className="mt-10" aria-label={t('chooseType')}>
      <h2 className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.2em]">
        {t('chooseType')}
      </h2>

      <ul className="border-ink-100 mt-4 grid gap-px border-t sm:grid-cols-2 lg:grid-cols-3">
        {offered.map((sub) => (
          <li key={sub.slug}>
            <Link
              href={`${base}?filter=${sub.slug}`}
              className="border-ink-100 hover:bg-surface-raised focus-visible:outline-gold-500 group flex items-baseline justify-between gap-4 border-b px-1 py-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="font-display text-ink-900 group-hover:text-gold-700 text-xl transition-colors">
                {subcategoryLabel(sub.slug, locale)}
              </span>
              <span className="text-ink-500 font-mono text-xs tabular-nums">
                {counts[sub.slug]}
              </span>
            </Link>
          </li>
        ))}

        {/*
          The way past the choice, and it needs a parameter of its own: linking
          back to the bare section would land on these same tiles, which is a
          loop rather than an escape. `?show=all` is the reader saying they have
          seen the choice and want everything anyway.
        */}
        <li>
          <Link
            href={`${base}?show=all`}
            className="border-ink-100 hover:bg-surface-raised focus-visible:outline-gold-500 group flex items-baseline justify-between gap-4 border-b px-1 py-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="text-ink-700 group-hover:text-gold-700 text-sm font-semibold uppercase tracking-wider transition-colors">
              {t('browseAll')}
            </span>
            <span className="text-ink-500 font-mono text-xs tabular-nums">{total}</span>
          </Link>
        </li>
      </ul>
    </nav>
  )
}
