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
 *
 * # There is no "browse everything" row
 *
 * There was one, carrying the section total and linking to `?show=all`. It was
 * removed: it sat at the end of a row of kinds of place without being one, and
 * it let a reader past the question the row exists to ask. The page still
 * honours `?show=all` so anything already pointing at it keeps working, but
 * nothing here offers it.
 *
 * The consequence is deliberate and worth knowing: a section is now entered
 * through a kind of place or through a filter below the row, and there is no
 * single click that shows everything in it. /directory is where that lives.
 */
export async function SubcategoryTiles({
  base,
  subcategories,
  counts,
  locale,
}: {
  /** The section's own path, e.g. `/stay`. */
  base: string
  subcategories: readonly { slug: string; retired?: boolean }[]
  /**
   * Listings per subcategory, or `null` when they could not all be counted.
   *
   * Unknown is not zero. Every tile is then a link without a number, because
   * treating an uncounted subcategory as empty would unlink it - and a kind of
   * place with listings behind it would be unreachable from its own section.
   * See lib/listings countBySubcategory.
   */
  counts: Record<string, number> | null
  locale: Locale
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
          const count = counts ? (counts[sub.slug] ?? 0) : null

          return (
            <li key={sub.slug}>
              {count === null || count > 0 ? (
                <Link
                  href={`${base}?filter=${sub.slug}`}
                  className={`${ROW} hover:bg-surface-raised focus-visible:outline-gold-500 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
                >
                  <span className="font-display text-ink-900 group-hover:text-gold-700 text-xl transition-colors">
                    {subcategoryLabel(sub.slug, locale)}
                  </span>
                  {count === null ? null : (
                    <span className="text-ink-500 font-mono text-xs tabular-nums">{count}</span>
                  )}
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
      </ul>
    </nav>
  )
}
