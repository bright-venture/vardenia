import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@vardenia/i18n'

/**
 * Narrow a URL segment to a locale, or stop rendering.
 *
 * # Why a layout guard is not enough
 *
 * `[locale]/layout.tsx` already calls `notFound()` for a segment that is not a
 * locale. That does not protect the page, because the App Router renders layout
 * and page **in parallel** - so a page that fetches data reaches the database
 * with whatever was in the URL before the layout's refusal means anything.
 *
 * That is not theoretical. Every browser asks for `/favicon.ico`, the middleware
 * matcher skips any path containing a dot, and the segment therefore arrived at
 * the homepage as the locale:
 *
 *     invalid input value for enum payload._locales: "favicon.ico"
 *
 * Production answered 500 for the first request a visitor's browser makes, and
 * WordPress scanners probing /xmlrpc.php and /config.php produced 93 more rows
 * of the same thing - which is a database round trip anyone can trigger by
 * asking for nonsense, and an error log too noisy to read.
 *
 * # Why it returns rather than only asserting
 *
 * The pattern it replaces was two steps that had to be remembered together:
 *
 *     if (!isLocale(locale)) notFound()
 *     const listings = await findListings({ locale: locale as Locale })
 *
 * The cast is what let the bad value through, and the check is what stopped it -
 * so a page could do half the job and still compile. Returning the narrowed
 * value makes them one action: there is no cast left to write, and nothing to
 * forget.
 *
 * Call it before the first `await` that touches data.
 */
export function requireLocale(locale: string): Locale {
  if (!isLocale(locale)) notFound()
  return locale
}
