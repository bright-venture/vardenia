import { sectionForCategory } from '@vardenia/core'

/**
 * Addresses that used to be right, kept working.
 *
 * The site has one of these so far: `/directory?category=hospitality` was how a
 * category was browsed before the seven section pages existed, and it is in old
 * links, in messages already sent, and possibly on paper beside a printed code.
 * It now redirects to `/stay`.
 *
 * # Why this is middleware and not a redirect in the page
 *
 * The directory page reads its query string inside a Suspense boundary, so by
 * the time it could redirect the response has already started and the status is
 * fixed at 200. Next falls back to correcting it in the browser, which works for
 * a person and not at all for a crawler - it indexes the shell of a page that
 * has moved. Verified rather than assumed: the in-page version answered 200 with
 * no Location header.
 *
 * Middleware answers before any of that, with a real 308.
 */

/**
 * Where this request should be sent instead, or null to leave it alone.
 *
 * Null for almost every request. Kept pure and separate from the middleware so
 * the path matching can be tested without a request object, because the one
 * thing that must not happen here is catching `/directory/le-gray-beirut` - a
 * listing address that may already be printed in a magazine.
 */
export function legacyCategoryRedirect(pathname: string, params: URLSearchParams): string | null {
  /**
   * `/directory` or `/ar/directory`, and nothing deeper.
   *
   * The trailing `\/?$` is what keeps a listing detail page out of this. A
   * pattern without it would match `/directory/le-gray-beirut` and redirect a
   * printed URL to a category listing.
   */
  const match = /^(\/[a-z]{2})?\/directory\/?$/.exec(pathname)
  if (!match) return null

  const section = sectionForCategory(params.get('category'))
  if (!section) return null

  // Locale prefix carried across, so an Arabic reader stays in Arabic.
  const prefix = match[1] ?? ''

  /**
   * Every other parameter comes too.
   *
   * The directory takes the same place, price and feature filters the sections
   * do, so a link to `/directory?category=hospitality&where=beirut` is a real
   * view somebody may have shared. Dropping everything but the category would
   * redirect them to a broader list than the one they sent, which is worse than
   * a 404 - it looks like it worked.
   *
   * `category` is the one left behind: it is what the path now expresses.
   */
  const kept = new URLSearchParams()
  for (const key of ['filter', 'where', 'district', 'area', 'price', 'has', 'page']) {
    const value = params.get(key)
    if (value) kept.set(key, value)
  }

  const query = kept.toString().replace(/%2C/g, ',')
  return `${prefix}/${section.path}${query ? `?${query}` : ''}`
}

/**
 * Standing pages that were merged into another, and the page they went into.
 *
 * Partner with us became part of Add your business on 25 November 2026 (the
 * owner's decision): its sections are there now (lib/pages). The old address is
 * in emails already sent and in search results, so it forwards rather than
 * answering 404.
 */
const MERGED_PAGES: Record<string, string> = {
  'partner-with-us': '/add-your-business',
}

/**
 * Where a merged page's old address goes, with the language kept
 * (`/ar/partner-with-us` to `/ar/add-your-business`), or null.
 */
export function mergedPageRedirect(pathname: string): string | null {
  const match = /^(\/[a-z]{2})?\/([a-z-]+)\/?$/.exec(pathname)
  if (!match) return null
  const target = MERGED_PAGES[match[2]!]
  return target ? `${match[1] ?? ''}${target}` : null
}
