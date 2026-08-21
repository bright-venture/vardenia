import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { SECTIONS } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { LanguageSwitcher, LanguageSwitcherLinks } from './LanguageSwitcher'
import { AccountLink } from './AccountLink'

/**
 * The site header.
 *
 * Deliberately lists only destinations that exist. "Discover" and "Regions" are
 * in the translation catalogue and have no routes behind them, so they are left
 * out rather than shipped as links that go nowhere - the same defect that made
 * offer QR codes resolve to a 404.
 *
 * # The sections come from the taxonomy
 *
 * Mapped from `SECTIONS` rather than written out here, so a category can never
 * exist in the database without a way to reach it. That was not theoretical:
 * weddings, lifestyle and healthcare could all be sold to and none of them
 * appeared anywhere in the navigation.
 *
 * # Two layouts, one list
 *
 * Seven sections plus magazine, search and account is far more than a phone can
 * hold in a row, and this site is read on phones - most readers arrive by
 * pointing a camera at a printed code. So the wide layout is a single row and
 * the narrow one is a disclosure.
 *
 * The disclosure is a `<details>` element, which means the menu opens and closes
 * with no JavaScript at all. That matters more here than elsewhere: the header
 * is on every page including the prerendered ones, and a script that has to load
 * before the navigation works is a script that fails first on the slow
 * connection where the navigation matters most.
 */
export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations('nav')

  const sectionLinks = SECTIONS.map((section) => (
    <Link
      key={section.path}
      href={`/${section.path}`}
      className="text-ink-700 hover:text-ink-900 transition-colors"
    >
      {locale === 'ar' ? section.ar : section.en}
    </Link>
  ))

  const search = (
    <Link href="/search" className="text-ink-700 hover:text-ink-900 transition-colors">
      {locale === 'ar' ? 'بحث' : 'Search'}
    </Link>
  )

  const magazine = (
    <Link href="/magazine" className="text-ink-700 hover:text-ink-900 transition-colors">
      {t('magazine')}
    </Link>
  )

  /* The switcher reads the query string so filters survive a language change,
     and reading it requires client rendering. Bounded in Suspense so that cost
     falls on two links rather than on the whole page: the fallback is the same
     markup without the query, which is what a crawler should see anyway. */
  const language = (
    <Suspense fallback={<LanguageSwitcherLinks current={locale} search="" />}>
      <LanguageSwitcher current={locale} />
    </Suspense>
  )

  return (
    <header className="border-ink-100 bg-surface-base sticky top-0 z-50 border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="font-display text-ink-900 shrink-0 text-xl tracking-tight">
          Vardenia
        </Link>

        {/* Wide: everything in one row. */}
        <nav
          aria-label={t('directory')}
          className="hidden items-center gap-x-5 gap-y-2 text-sm lg:flex"
        >
          {sectionLinks}
          {magazine}
          {search}
          <AccountLink locale={locale} />
          {language}
        </nav>

        {/* Narrow: a disclosure. Both navigations are in the markup and one is
            `display: none` at any width, which keeps it out of the accessibility
            tree as well as off the screen - so nothing is announced twice. The
            links are built once above and rendered into whichever is showing. */}
        <details className="group relative lg:hidden">
          <summary
            className="text-ink-700 hover:text-ink-900 flex cursor-pointer list-none items-center gap-2 text-sm"
            aria-label={locale === 'ar' ? 'القائمة' : 'Menu'}
          >
            <span className="flex flex-col gap-[3px]" aria-hidden>
              <span className="bg-ink-700 block h-[1.5px] w-5" />
              <span className="bg-ink-700 block h-[1.5px] w-5" />
              <span className="bg-ink-700 block h-[1.5px] w-5" />
            </span>
            {locale === 'ar' ? 'القائمة' : 'Menu'}
          </summary>

          <nav
            aria-label={t('directory')}
            className="border-ink-100 bg-surface-base absolute end-0 z-50 mt-4 flex w-64 flex-col gap-3 rounded-md border p-5 text-sm shadow-lg"
          >
            {sectionLinks}
            <span className="border-ink-100 border-t pt-3">{magazine}</span>
            {search}
            <span className="border-ink-100 border-t pt-3">
              <AccountLink locale={locale} />
            </span>
            <span className="border-ink-100 border-t pt-3">{language}</span>
          </nav>
        </details>
      </div>
    </header>
  )
}
