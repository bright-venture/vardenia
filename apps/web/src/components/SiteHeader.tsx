import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { SECTIONS } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { LanguageSwitcher, LanguageSwitcherLinks } from './LanguageSwitcher'

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
 * Seven is more than a header comfortably holds at this size. They are all
 * listed for now because a link that exists beats a link that is tidy; grouping
 * them behind a menu is a design decision that belongs with the visual pass.
 *
 * Structure, not styling. What matters now is that every page built so far is
 * reachable without typing a URL.
 */
export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations('nav')
  const account = await getTranslations('account')

  return (
    <header className="border-ink-100 bg-surface-base sticky top-0 z-50 border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="font-display text-ink-900 text-xl tracking-tight">
          Vardenia
        </Link>

        <nav
          aria-label={t('directory')}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
        >
          {SECTIONS.map((section) => (
            <Link
              key={section.path}
              href={`/${section.path}`}
              className="text-ink-700 hover:text-ink-900 transition-colors"
            >
              {locale === 'ar' ? section.ar : section.en}
            </Link>
          ))}
          <Link href="/magazine" className="text-ink-700 hover:text-ink-900 transition-colors">
            {t('magazine')}
          </Link>
          {/* One link whether or not anybody is signed in, and it says "your
              account" either way.

              The alternative - "Sign in" or the reader's name, depending -
              means reading the session in the layout, and reading the session
              means `headers()`, which would opt every prerendered page in the
              site out of static rendering for a word in the header. The account
              page itself is dynamic and shows the right thing when they get
              there. */}
          <Link href="/account" className="text-ink-700 hover:text-ink-900 transition-colors">
            {account('title')}
          </Link>
          {/* The switcher reads the query string so filters survive a language
              change, and reading it requires client rendering. Bounded here so
              that cost falls on two links rather than on the whole page: the
              fallback is the same markup without the query, which is exactly
              what a crawler should see anyway. */}
          <Suspense fallback={<LanguageSwitcherLinks current={locale} search="" />}>
            <LanguageSwitcher current={locale} />
          </Suspense>
        </nav>
      </div>
    </header>
  )
}
