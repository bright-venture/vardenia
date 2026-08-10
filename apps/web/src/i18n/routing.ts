import { defineRouting } from 'next-intl/routing'
import { createNavigation } from 'next-intl/navigation'
import { DEFAULT_LOCALE, LOCALES } from '@vardenia/i18n'

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // English lives at the root (/directory), Arabic is prefixed (/ar/directory).
  // Keeps the primary market's URLs clean and stable for print.
  localePrefix: 'as-needed',

  // Do not auto-redirect based on the browser's Accept-Language header.
  //
  // Three reasons, in order of how much they cost us:
  //  1. Printed URLs must resolve to the page that was printed. A magazine
  //     prints vardenia.com/directory/le-gray-beirut; it must not silently
  //     become /ar/directory/le-gray-beirut on an Arabic-set phone.
  //  2. next-intl remembers the choice in a NEXT_LOCALE cookie for a year, so
  //     one visit to /ar would pin a reader to Arabic with no way back until a
  //     language switcher exists.
  //  3. Search crawlers request with their own language headers, so detection
  //     makes which page gets indexed unpredictable.
  //
  // Language becomes an explicit choice via a switcher (Phase 1), not a guess.
  localeDetection: false,
})

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
