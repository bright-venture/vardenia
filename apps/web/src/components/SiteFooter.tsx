import { getTranslations } from 'next-intl/server'
import type { Locale } from '@vardenia/i18n'
import { Link } from '../i18n/routing'
import { findPages } from '../lib/pages'

/**
 * The site footer.
 *
 * Standing pages are read from the CMS rather than hardcoded, so publishing
 * "Privacy Policy" in the admin makes it appear here on its own. Nobody has to
 * remember to also add a link, which is how footers end up missing the one page
 * a regulator asks for.
 *
 * Only published pages come back: `findPages` runs with `overrideAccess: false`,
 * so a draft in progress stays out of the footer.
 *
 * The year is computed at render. These pages are statically generated, so a
 * hardcoded one would quietly go stale and a hydration-mismatched client clock
 * would be worse.
 */
export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations('nav')
  const ar = locale === 'ar'
  const pages = await findPages(locale)

  return (
    <footer className="border-ink-100 mt-24 border-t">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <p className="font-display text-ink-900 text-lg">Vardenia</p>
            <p className="text-ink-500 mt-2 max-w-xs text-sm">
              {ar
                ? 'دليل لبنان للسياحة ونمط الحياة، منسّق وموثّق.'
                : "Lebanon's tourism and lifestyle guide, curated and verified."}
            </p>
          </div>

          <nav aria-label={ar ? 'تذييل' : 'Footer'} className="flex flex-col gap-2 text-sm">
            <Link href="/directory" className="text-ink-700 hover:text-ink-900 transition-colors">
              {t('directory')}
            </Link>
            <Link href="/magazine" className="text-ink-700 hover:text-ink-900 transition-colors">
              {t('magazine')}
            </Link>
            <Link
              href="/magazine/issues"
              className="text-ink-700 hover:text-ink-900 transition-colors"
            >
              {ar ? 'الأعداد' : 'Issues'}
            </Link>
          </nav>

          {pages.length > 0 ? (
            <nav
              aria-label={ar ? 'صفحات الموقع' : 'Site pages'}
              className="flex flex-col gap-2 text-sm"
            >
              {pages.map((page) => (
                <Link
                  key={page.id}
                  href={`/pages/${page.slug}`}
                  className="text-ink-700 hover:text-ink-900 transition-colors"
                >
                  {page.title}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>

        <p className="text-ink-300 mt-10 text-xs">
          &copy; {new Date().getFullYear()} Vardenia.{' '}
          {ar ? 'كل الحقوق محفوظة.' : 'All rights reserved.'}
        </p>
      </div>
    </footer>
  )
}
