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
 * # Why every subcategory is listed, including the empty ones
 *
 * The row used to drop anything with nothing behind it, which read as a
 * complete menu and was not one: "Stay" showed three of its eight kinds of
 * place and gave a reader no way to tell whether Lebanon has no mountain
 * resorts or whether Vardenia simply has not added any yet. The section is the
 * taxonomy, so the row states the taxonomy, and the count says what is there.
 *
 * An empty one is shown but not linked. A count of zero has already answered
 * the question the click would ask, and a tile that leads to an empty results
 * page is a dead end we sent the reader into. So it renders as plain text, out
 * of the tab order and marked up as a disabled item, while the ones with
 * listings behind them stay links.
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
  subcategories: readonly { slug: string; retired?: boolean }[]
  counts: Record<string, number>
  locale: Locale
  /** Listings in the whole section, for the "everything" tile. */
  total: number
}) {
  const t = await getTranslations('directory')

  /**
   * Retired is the one reason to leave a subcategory out.
   *
   * It means the slug has shipped and must keep resolving for printed codes,
   * not that it is still on offer - so it stays out of a menu of things to
   * choose. See TAXONOMY, which forbids deleting a slug outright.
   */
  const offered = subcategories.filter((sub) => !sub.retired)

  // Nothing to choose between is not a choice.
  if (offered.length < 2) return null

  const ROW =
    'border-ink-100 flex items-baseline justify-between gap-4 border-b px-1 py-5 transition-colors'

  return (
    <nav className="mt-10" aria-label={t('chooseType')}>
      <h2 className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.2em]">
        {t('chooseType')}
      </h2>

      <ul className="border-ink-100 mt-4 grid gap-px border-t sm:grid-cols-2 lg:grid-cols-3">
        {offered.map((sub) => {
          const count = counts[sub.slug] ?? 0

          return (
            <li key={sub.slug}>
              {count > 0 ? (
                <Link
                  href={`${base}?filter=${sub.slug}`}
                  className={`${ROW} hover:bg-surface-raised focus-visible:outline-gold-500 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
                >
                  <span className="font-display text-ink-900 group-hover:text-gold-700 text-xl transition-colors">
                    {subcategoryLabel(sub.slug, locale)}
                  </span>
                  <span className="text-ink-500 font-mono text-xs tabular-nums">{count}</span>
                </Link>
              ) : (
                /*
                  Not a link, and said so rather than merely greyed: a sighted
                  reader has the count, and `aria-disabled` is what gives a
                  screen reader the same fact.

                  The label drops from ink-900 to ink-500 and nothing else
                  changes, so the row keeps its place in the menu. Not ink-300,
                  which is the obvious "disabled" step and measures 2.11 against
                  this ground - it may tint an icon and never carries a glyph.
                  See lib/contrast.test, which enforces that.
                */
                <div className={ROW} aria-disabled="true">
                  <span className="font-display text-ink-500 text-xl">
                    {subcategoryLabel(sub.slug, locale)}
                  </span>
                  <span className="text-ink-500 font-mono text-xs tabular-nums">{count}</span>
                </div>
              )}
            </li>
          )
        })}

        {/*
          The way past the choice, and it needs a parameter of its own: linking
          back to the bare section would land on these same tiles, which is a
          loop rather than an escape. `?show=all` is the reader saying they have
          seen the choice and want everything anyway.
        */}
        <li>
          {total > 0 ? (
            <Link
              href={`${base}?show=all`}
              className={`${ROW} hover:bg-surface-raised focus-visible:outline-gold-500 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
            >
              <span className="text-ink-700 group-hover:text-gold-700 text-sm font-semibold uppercase tracking-wider transition-colors">
                {t('browseAll')}
              </span>
              <span className="text-ink-500 font-mono text-xs tabular-nums">{total}</span>
            </Link>
          ) : (
            /*
              Nothing in the section at all, which happens on the four that are
              still being filled. Every row above is a nought, so this one is
              too, and offering the way out of a choice nobody can make would
              lead to the same empty page the reader is already looking at.
            */
            <div className={ROW} aria-disabled="true">
              <span className="text-ink-500 text-sm font-semibold uppercase tracking-wider">
                {t('browseAll')}
              </span>
              <span className="text-ink-500 font-mono text-xs tabular-nums">{total}</span>
            </div>
          )}
        </li>
      </ul>
    </nav>
  )
}
