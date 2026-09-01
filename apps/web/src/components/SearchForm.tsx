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

      {/*
        One bordered rectangle with the button flush inside it, rather than a
        rounded field and a rounded button with a gap. That is the design's
        treatment and it is the same shape as the masthead's search on the home
        page, which matters here more than usual: a reader who searched from the
        front page lands on this and should recognise the box they typed into.

        `focus-within` on the wrapper, because the focus ring has to be on the
        thing that looks like the control. A ring around the input alone would
        draw a rectangle inside a rectangle.
      */}
      <div className="border-ink-300 bg-surface-raised focus-within:border-gold-500 flex items-stretch border transition-colors">
        <input
          id="site-search"
          type="search"
          name="q"
          defaultValue={initial}
          autoFocus={autoFocus}
          maxLength={80}
          placeholder={ar ? 'فندق، مطعم، مقال' : 'A hotel, a restaurant, an article'}
          className="text-ink-900 placeholder:text-ink-500 w-full bg-transparent px-5 py-4 outline-none"
        />
        <button
          type="submit"
          className="bg-cedar-900 text-surface-base hover:bg-gold-700 px-6 text-sm font-semibold transition-colors"
        >
          {label}
        </button>
      </div>
    </form>
  )
}
