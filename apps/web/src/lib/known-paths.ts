import { SECTION_PATHS } from '@vardenia/core'

/**
 * Every first path segment the site actually serves.
 *
 * # Why this list has to exist
 *
 * `[locale]/[section]` is a catch-all for single-segment URLs, so `/nonsense`
 * reaches it, fails `sectionForPath`, and calls `notFound()`. That renders the
 * 404 page and returns **200**, which was measured rather than assumed:
 *
 *     /nonsense                    200  (rewritten to /en/nonsense)
 *     /ar/nonsense                 200  (not rewritten at all)
 *     /directory/no-such-listing   200
 *
 * `notFound()` does not set a status in this application. The usual suspect is
 * the middleware rewrite, and it is not the cause: `/ar/nonsense` carries no
 * rewrite header and behaves identically. What is unusual here is that there is
 * no root `app/layout.tsx` at all - `(frontend)` and `(payload)` are route
 * groups with separate root layouts, which Next supports and which changes how
 * the not-found boundary is served.
 *
 * A soft 404 is not cosmetic. A crawler reads the status line, not the words on
 * the page, so every invented URL a scanner probes becomes an indexed page.
 *
 * # What this fixes and what it does not
 *
 * The middleware can decide a single-segment path with no database: either it
 * is one of these, or nothing serves it. That covers what crawlers and
 * vulnerability scanners actually request.
 *
 * It cannot decide `/directory/no-such-listing`, which needs a lookup the
 * middleware has no business doing. Those stay soft until Next resolves the
 * status problem, and that limitation is stated in docs/SECURITY-AUDIT.md
 * rather than papered over here.
 *
 * # Keeping it true
 *
 * The list is checked against the app directory by known-paths.test.ts, so a new
 * top-level route that nobody adds here fails the suite rather than silently
 * becoming a 404.
 */

/** Routes that are not sections and are not locale-prefixed page directories. */
const FIXED_SEGMENTS = [
  'about',
  'account',
  'add-your-business',
  'advertise',
  'contact',
  'directory',
  'faq',
  'legal',
  'magazine',
  'partner',
  'partner-with-us',
  'scan',
  'search',
] as const

/**
 * Prefixes the middleware never sees, listed so the test can account for every
 * directory under app/ and not quietly ignore one.
 */
export const UNMATCHED_PREFIXES = [
  'api',
  // Where the middleware sends an unknown path. Excluded from locale routing
  // by the matcher, so it cannot be rewritten into itself.
  'not-found-404',
  'admin',
  'auth',
  'booking',
  'g',
  'qr',
  'reports',
  'media',
] as const

export const KNOWN_SEGMENTS: ReadonlySet<string> = new Set<string>([
  ...SECTION_PATHS,
  ...FIXED_SEGMENTS,
])

/**
 * Is this a single-segment path that nothing serves?
 *
 * Only single segments. A deeper path may be a listing slug or an article, and
 * whether those exist is a question for the page, not for this.
 */
export function isUnknownTopLevelPath(pathname: string, locales: readonly string[]): boolean {
  const segments = pathname.split('/').filter(Boolean)

  // Strip a locale prefix, so /ar/nonsense is judged the same as /nonsense.
  const withoutLocale = locales.includes(segments[0] ?? '') ? segments.slice(1) : segments

  // The homepage, and anything with more than one segment.
  if (withoutLocale.length !== 1) return false

  const segment = withoutLocale[0]
  if (!segment) return false

  // A file, not a page. The matcher already excludes these, but the guard is
  // cheap and this function is exported and testable on its own.
  if (segment.includes('.')) return false

  return !KNOWN_SEGMENTS.has(segment)
}
