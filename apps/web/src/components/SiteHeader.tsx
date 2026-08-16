import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
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
 * Structure, not styling. The visual design lands later; what matters now is
 * that every page built so far is reachable without typing a URL.
 */
export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations('nav')

  return (
    <header className="border-ink-100 bg-surface-base sticky top-0 z-50 border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="font-display text-ink-900 text-xl tracking-tight">
          Vardenia
        </Link>

        <nav aria-label={t('directory')} className="flex items-center gap-6 text-sm">
          <Link href="/directory" className="text-ink-700 hover:text-ink-900 transition-colors">
            {t('directory')}
          </Link>
          <Link href="/magazine" className="text-ink-700 hover:text-ink-900 transition-colors">
            {t('magazine')}
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
