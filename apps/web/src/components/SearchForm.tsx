import type { Locale } from '@vardenia/i18n'
import { getPathname } from '../i18n/routing'

/**
 * The search box.
 *
 * A plain form with a GET, and no JavaScript at all. Submitting navigates to
 * `/search?q=...`, which is a real URL a reader can bookmark, share or reload -
 * the same reasoning as the directory filters, and it works before hydration and
 * without it.
 *
 * That also means this is a server component, so it costs nothing on a page that
 * is otherwise static. A client component here would pull the whole header into
 * the browser bundle to save one navigation.
 *
 * `action` has to be built with `getPathname` rather than written as "/search":
 * with `localePrefix: 'as-needed'` the Arabic page lives at /ar/search, and a
 * hardcoded path would drop an Arabic reader into the English results.
 */
export function SearchForm({
  locale,
  initial = '',
  autoFocus = false,
}: {
  locale: Locale
  initial?: string
  autoFocus?: boolean
}) {
  const ar = locale === 'ar'
  const label = ar ? 'ابحث' : 'Search'

  return (
    <form action={getPathname({ href: '/search', locale })} method="get" role="search">
      <label htmlFor="site-search" className="sr-only">
        {label}
      </label>

      <div className="flex gap-2">
        <input
          id="site-search"
          type="search"
          name="q"
          defaultValue={initial}
          autoFocus={autoFocus}
          maxLength={80}
          placeholder={ar ? 'فندق، مطعم، مقال' : 'A hotel, a restaurant, an article'}
          className="border-ink-100 focus:border-ink-300 text-ink-900 placeholder:text-ink-300 w-full rounded-md border px-4 py-2 text-sm outline-none transition-colors"
        />
        <button
          type="submit"
          className="bg-ink-900 text-surface-base rounded-md px-4 py-2 text-sm transition-opacity hover:opacity-90"
        >
          {label}
        </button>
      </div>
    </form>
  )
}
