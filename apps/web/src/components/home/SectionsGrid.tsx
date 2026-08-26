import { getTranslations } from 'next-intl/server'
import { SECTIONS } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../../i18n/routing'
import { SECTION_ICONS, SEARCH_ICON } from '../navIcons'

/**
 * The seven sections, as the way into the directory.
 *
 * # Generated, not written out
 *
 * Straight from `SECTIONS` in packages/core, which is a `Record` keyed by
 * category slug and therefore cannot compile with a category missing. That is
 * the guarantee this grid exists to inherit: a category cannot be sold to,
 * stamped onto a printed QR code, and then have nowhere on the site to land.
 *
 * # Why each one carries a sentence
 *
 * Seven nouns tell a first-time reader almost nothing. "Lifestyle" and
 * "Experiences" could be anything, and a visitor who cannot tell them apart
 * picks neither. The descriptions come from the same source as the menu, so the
 * two can never disagree.
 *
 * # The eighth tile
 *
 * "The whole directory" is the odd one out in a seven-item grid and useful
 * exactly there: it is what a reader wants when none of the seven is quite it.
 * It sits on the sunken surface so it reads as a different kind of thing rather
 * than an eighth category.
 *
 * # One-pixel grid
 *
 * The cells are separated by the container's own background showing through a
 * 1px gap, rather than by a border on each cell. Borders on adjacent cells
 * double up into 2px seams; this cannot.
 */
export async function SectionsGrid({ locale }: { locale: Locale }) {
  const t = await getTranslations('home')
  const ar = locale === 'ar'

  return (
    <div className="bg-ink-100 border-ink-100 grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
      {SECTIONS.map((section) => {
        const Icon = SECTION_ICONS[section.category]
        return (
          <Link
            key={section.path}
            href={`/${section.path}`}
            className="bg-surface-base hover:bg-surface-raised group relative flex min-h-[9.5rem] flex-col gap-2 p-6 transition-colors"
          >
            <Icon aria-hidden className="text-gold-700 size-5 shrink-0" strokeWidth={1.5} />
            <span className="font-display text-ink-900 text-xl leading-tight">
              {ar ? section.ar : section.en}
            </span>
            <span className="text-ink-500 text-sm leading-relaxed">
              {ar ? section.descriptionAr : section.descriptionEn}
            </span>

            {/* Draws left to right on hover. Sits under the cell rather than
                inside its padding, so it spans the full width. */}
            <span
              aria-hidden
              className="bg-gold-500 absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
            />
          </Link>
        )
      })}

      <Link
        href="/directory"
        className="bg-surface-sunken hover:bg-surface-raised group relative flex min-h-[9.5rem] flex-col gap-2 p-6 transition-colors"
      >
        <SEARCH_ICON aria-hidden className="text-gold-700 size-5 shrink-0" strokeWidth={1.5} />
        <span className="font-display text-ink-900 text-xl leading-tight">
          {t('wholeDirectory')}
        </span>
        <span className="text-ink-500 text-sm leading-relaxed">{t('wholeDirectoryNote')}</span>
        <span
          aria-hidden
          className="bg-gold-500 absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
        />
      </Link>
    </div>
  )
}
