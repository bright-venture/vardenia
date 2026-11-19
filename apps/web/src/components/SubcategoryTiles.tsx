import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { subcategoryLabel } from '../lib/labels'
import { filterHref, type FilterState } from './ListingFilters'

/**
 * The kinds of place in a section (Hotels, Getaways), as large filter tabs
 * above the listings (18 November 2026).
 *
 * They used to be a separate first screen: a reader picked Hotels and only
 * then saw any listing. Now every listing of the section shows at once, and
 * these tabs narrow it in place, keeping the other filters and the dates. "All"
 * comes first; the chosen kind is drawn in navy, so it reads as the answer to
 * "what am I looking at". Tapping the chosen one again shows all.
 *
 * A kind with nothing in it is shown but not linked, with its nought, so the
 * row states the whole taxonomy and never leads to an empty page.
 */
export async function SubcategoryTiles({
  base,
  state,
  subcategories,
  counts,
  total,
  locale,
}: {
  /** The section's own path, e.g. `/stay`. */
  base: string
  /** The current filters, kept when a tab is chosen. */
  state: FilterState
  subcategories: readonly { slug: string; retired?: boolean }[]
  /**
   * Listings per subcategory, or `null` when they could not all be counted.
   * Unknown is not zero: every tab is then a link without a number.
   */
  counts: Record<string, number> | null
  /** Listings in the whole section, for the All tab. */
  total: number | null
  locale: Locale
}) {
  const t = await getTranslations('directory')

  // Retired kinds keep resolving for printed codes but are not on offer.
  const offered = subcategories.filter((sub) => !sub.retired)

  // Nothing to choose between is not a choice.
  if (offered.length < 2) return null

  const TAB =
    'flex min-h-[64px] items-baseline justify-between gap-4 border px-5 py-4 transition-colors'
  const ACTIVE = 'border-cedar-900 bg-cedar-900 text-surface-base'
  const IDLE =
    'border-ink-100 bg-surface-raised text-ink-900 hover:border-ink-300 focus-visible:outline-gold-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

  const tab = (key: string, label: string, count: number | null, active: boolean, href: string) => (
    <li key={key}>
      {count === null || count > 0 || active ? (
        <Link
          href={href}
          // A filtered view, not a page of its own (see FilterChip).
          prefetch={false}
          rel="nofollow"
          scroll={false}
          aria-current={active ? 'true' : undefined}
          className={`${TAB} ${active ? ACTIVE : IDLE}`}
        >
          <span className="font-display text-xl">{label}</span>
          {count === null ? null : (
            <span
              className={`font-mono text-xs tabular-nums ${active ? 'text-surface-base' : 'text-ink-500'}`}
            >
              {count}
            </span>
          )}
        </Link>
      ) : (
        <div className={`${TAB} border-ink-100`} aria-disabled="true">
          <span className="font-display text-ink-500 text-xl">{label}</span>
          <span className="text-ink-500 font-mono text-xs tabular-nums">{count}</span>
        </div>
      )}
    </li>
  )

  return (
    <nav className="vd-subcategories mt-8" aria-label={t('chooseType')}>
      <h2 className="text-ink-500 font-mono text-[11px] uppercase tracking-[0.2em]">
        {t('chooseType')}
      </h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tab(
          'all',
          t('all'),
          total,
          !state.subcategory,
          filterHref(base, state, { subcategory: undefined }),
        )}
        {offered.map((sub) => {
          const active = state.subcategory === sub.slug
          return tab(
            sub.slug,
            subcategoryLabel(sub.slug, locale),
            counts ? (counts[sub.slug] ?? 0) : null,
            active,
            filterHref(base, state, { subcategory: active ? undefined : sub.slug }),
          )
        })}
      </ul>
    </nav>
  )
}
