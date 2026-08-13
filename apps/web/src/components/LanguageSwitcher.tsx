'use client'

import NextLink from 'next/link'
import { LOCALES, type Locale } from '@vardenia/i18n'
import { getPathname, usePathname } from '../i18n/routing'

/**
 * Switches language without losing the reader's place.
 *
 * `usePathname` from our routing helper returns the path with the locale prefix
 * already stripped, so passing it back to `Link` with a different `locale`
 * rebuilds the same page in the other language. Reading a listing and switching
 * to Arabic keeps you on that listing.
 *
 * This is not a convenience feature. `localeDetection` is off (see
 * i18n/routing.ts, and the redirect loop that made it necessary), which means
 * until this exists an Arabic reader landing on an English URL has no route to
 * Arabic except editing the address bar.
 *
 * Both languages are always shown rather than a toggle labelled with the other
 * one: a reader who does not read the current language cannot be expected to
 * parse a label written in it.
 *
 * The href is built with `getPathname` and handed to a plain next/link rather
 * than to next-intl's `Link` with a `locale` prop. That prop forces the prefix
 * on, so the English link rendered as /en/directory/le-royal-hotel and then
 * 307'd to /directory/le-royal-hotel. It worked, but it put a non-canonical URL
 * in the markup for crawlers and cost a redirect on every switch, and under
 * `localePrefix: 'as-needed'` the unprefixed form is the real address.
 */

const LABELS: Record<Locale, string> = {
  en: 'EN',
  ar: 'ع',
}

const FULL_NAMES: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
}

export function LanguageSwitcher({ current }: { current: Locale }) {
  // Already the concrete path with the locale prefix stripped, so a slug page
  // switches to the same slug rather than to a route template.
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-1 text-xs">
      {LOCALES.map((locale, index) => (
        <span key={locale} className="flex items-center gap-1">
          {index > 0 ? <span className="text-ink-300">/</span> : null}
          {locale === current ? (
            <span aria-current="true" className="text-ink-900 font-semibold">
              {LABELS[locale]}
            </span>
          ) : (
            <NextLink
              href={getPathname({ href: pathname, locale })}
              hrefLang={locale}
              aria-label={FULL_NAMES[locale]}
              className="text-ink-500 hover:text-ink-900 transition-colors"
            >
              {LABELS[locale]}
            </NextLink>
          )}
        </span>
      ))}
    </div>
  )
}
