'use client'

import NextLink from 'next/link'
import { useSearchParams } from 'next/navigation'
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

/**
 * The links themselves, given a query string rather than reading one.
 *
 * Split out so the header can render it during static generation. Reading the
 * query string requires `useSearchParams`, which forces the nearest Suspense
 * boundary to render on the client - and with this component sitting in the
 * layout, an unbounded one would opt every page in the site out of static
 * rendering. This half has no hooks that care, so it serves as the fallback.
 */
export function LanguageSwitcherLinks({ current, search }: { current: Locale; search: string }) {
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-1 text-xs">
      {LOCALES.map((locale, index) => (
        <span key={locale} className="flex items-center gap-1">
          {index > 0 ? <span className="text-ink-500">/</span> : null}
          {locale === current ? (
            <span aria-current="true" className="text-ink-900 font-semibold">
              {LABELS[locale]}
            </span>
          ) : (
            <NextLink
              href={`${getPathname({ href: pathname, locale })}${search}`}
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

/**
 * Carries the query string across the switch.
 *
 * Without this, a reader filtering the directory by category and switching to
 * Arabic landed on /ar/directory with the filter gone - and the same for a page
 * number. The path was preserved and the state on top of it was not, which is
 * the half of "keeps you where you were" nobody notices until they use it.
 */
export function LanguageSwitcher({ current }: { current: Locale }) {
  const params = useSearchParams()
  const query = params.toString()

  return <LanguageSwitcherLinks current={current} search={query ? `?${query}` : ''} />
}
