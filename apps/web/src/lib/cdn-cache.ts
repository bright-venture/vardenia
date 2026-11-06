/**
 * Lets Netlify's CDN keep the directory and the section pages for a few
 * minutes, instead of building them again for every visit.
 *
 * Both pages read their filters from the address (`?area=…&open=1`), and a
 * page that reads `searchParams` is built per request: Next sends `private,
 * no-store`, so every view of /directory or /stay ran a function. Measured on
 * 5 November 2026, those were the only browsed pages answering `no-store`; the
 * home page and the listings are already stored.
 *
 * Nothing on them depends on who is looking: no session, no saved places (the
 * account pages are the ones that read a sign-in, lib/session). So one copy
 * serves everyone, kept per full address with `Netlify-Vary: query`, so each
 * filter combination is its own copy and never another's.
 *
 * Five minutes, and five more served while a fresh copy is built behind it: a
 * listing changed in the admin shows here within about ten minutes, which is
 * the price of not rebuilding the page on every view. Browsers are not asked
 * to keep anything (`Cache-Control` is untouched); only the CDN is.
 *
 * The paths are spelled out because next.config cannot import the workspace
 * packages that hold them; cdn-cache.test.ts checks they match SECTIONS and
 * LOCALES, so a new section or language cannot be left out unnoticed.
 */

export const CACHED_SECTION_PATHS = [
  'stay',
  'eat-and-drink',
  'experiences',
  'weddings',
  'lifestyle',
  'getting-around',
] as const

/** Every locale but English, which has no prefix. */
export const PREFIXED_LOCALES = ['ar', 'fr', 'es', 'pt', 'ru', 'zh', 'hi', 'bn', 'ur'] as const

export const CDN_CACHE_VALUE = 'public, durable, s-maxage=300, stale-while-revalidate=300'

const HEADERS = [
  { key: 'Netlify-CDN-Cache-Control', value: CDN_CACHE_VALUE },
  { key: 'Netlify-Vary', value: 'query' },
]

export function cdnCacheHeaders() {
  const paths = ['directory', ...CACHED_SECTION_PATHS]
  const locales = PREFIXED_LOCALES.join('|')
  return paths.flatMap((path) => [
    { source: `/${path}`, headers: HEADERS },
    { source: `/:locale(${locales})/${path}`, headers: HEADERS },
  ])
}
