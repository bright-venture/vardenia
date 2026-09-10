'use client'

import NextLink from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { LOCALES, LOCALE_META, type Locale } from '@vardenia/i18n'
import { getPathname, usePathname } from '../i18n/routing'

/**
 * Switches language without losing the reader's place.
 *
 * `usePathname` from our routing helper returns the path with the locale prefix
 * already stripped, so passing it back with a different `locale` rebuilds the
 * same page in the other language. Reading a listing and switching to French
 * keeps you on that listing.
 *
 * This is not a convenience feature. `localeDetection` is off (see
 * i18n/routing.ts, and the redirect loop that made it necessary), which means
 * until this exists a reader landing on an English URL has no route to another
 * language except editing the address bar.
 *
 * # A disclosure, not a row
 *
 * It used to be an inline `EN / ع` row, which stopped scaling the moment the
 * site went past two languages. A native `<details>` is a dropdown that opens
 * with no JavaScript, so it keeps working during static generation and for a
 * reader with scripting off. Each entry is labelled in its own language and
 * carries its own `dir` and `lang`, because a reader who does not read the
 * current language cannot be expected to find theirs written in it.
 *
 * The href is built with `getPathname` and handed to a plain next/link rather
 * than to next-intl's `Link` with a `locale` prop, which forces the prefix on
 * and cost a 307 and a non-canonical URL in the markup on every switch. Under
 * `localePrefix: 'as-needed'` the unprefixed form is the real English address.
 */

/**
 * The links themselves, given a query string rather than reading one.
 *
 * Split out so the header can render it during static generation. Reading the
 * query string requires `useSearchParams`, which forces the nearest Suspense
 * boundary to render on the client - and with this component in the layout, an
 * unbounded one would opt every page out of static rendering. This half has no
 * hooks that care, so it serves as the fallback.
 */
export function LanguageSwitcherLinks({ current, search }: { current: Locale; search: string }) {
  const pathname = usePathname()

  return (
    <details className="relative text-xs">
      <summary className="text-ink-700 hover:text-ink-900 flex cursor-pointer list-none items-center gap-1.5 transition-colors [&::-webkit-details-marker]:hidden">
        <span dir={LOCALE_META[current].dir} lang={current}>
          {LOCALE_META[current].nativeLabel}
        </span>
        <ChevronDown aria-hidden size={13} />
      </summary>

      <ul className="border-ink-100 bg-surface-base absolute end-0 z-50 mt-2 max-h-80 w-44 overflow-auto border py-1 shadow-lg">
        {LOCALES.map((locale) => {
          const meta = LOCALE_META[locale]

          if (locale === current) {
            return (
              <li key={locale}>
                <span
                  aria-current="true"
                  dir={meta.dir}
                  lang={locale}
                  className="text-ink-900 block px-3 py-1.5 font-semibold"
                >
                  {meta.nativeLabel}
                </span>
              </li>
            )
          }

          return (
            <li key={locale}>
              <NextLink
                href={`${getPathname({ href: pathname, locale })}${search}`}
                hrefLang={locale}
                dir={meta.dir}
                lang={locale}
                className="text-ink-500 hover:bg-surface-sunken hover:text-ink-900 block px-3 py-1.5 transition-colors"
              >
                {meta.nativeLabel}
              </NextLink>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

/**
 * Carries the query string across the switch.
 *
 * Without this, a reader filtering the directory by category and switching
 * language landed on /ar/directory with the filter gone - and the same for a
 * page number. The path was preserved and the state on top of it was not, which
 * is the half of "keeps you where you were" nobody notices until they use it.
 */
export function LanguageSwitcher({ current }: { current: Locale }) {
  const params = useSearchParams()
  const query = params.toString()

  return <LanguageSwitcherLinks current={current} search={query ? `?${query}` : ''} />
}
