import type { MetadataRoute } from 'next'
import { SECTIONS } from '@vardenia/core'
import { LOCALES } from '@vardenia/i18n'
import { CONTENT_PAGE_SLUGS } from '../lib/pages'
import { findAllListingSlugs } from '../lib/listings'
import { findAllArticleSlugs } from '../lib/articles'
import { findAllIssueSlugs } from '../lib/issues'

/**
 * The list of pages we want indexed, handed to search engines directly.
 *
 * Crawlers find pages by following links, which is slow and misses anything not
 * linked prominently - a listing forty pages into the directory, say. A sitemap
 * removes the guesswork.
 *
 * Every entry declares both language versions through `alternates.languages`.
 * That matters more here than on a monolingual site: without it Google reads the
 * English and Arabic versions of a listing as two separate pages competing for
 * the same terms, and picks one more or less arbitrarily. With it, they are one
 * page in two languages, and the right one is served to each reader.
 *
 * Only published documents appear: every `findAll*Slugs` query runs with
 * `overrideAccess: false`, so drafts are filtered out in the database rather
 * than here. A sitemap is a public document and a leaked draft slug in one is
 * an invitation.
 */

const CHANGE_FREQUENCY = {
  /** The directory grows and listings get edited. */
  listing: 'weekly',
  /** Editorial is written once and rarely revised. */
  article: 'monthly',
  /** An issue is fixed the moment it prints. */
  issue: 'yearly',
  /** Index pages change whenever anything under them does. */
  index: 'daily',
} as const

function localized(path: string) {
  return {
    // English lives unprefixed, so the canonical URL is the bare path.
    url: path,
    alternates: {
      languages: Object.fromEntries(
        LOCALES.map((locale) => {
          if (locale === 'en') return [locale, path]
          // The homepage is '/', and naive concatenation gives '/ar/'. That
          // redirects rather than resolving, and a sitemap full of redirects is
          // a sitemap a crawler half-trusts.
          return [locale, path === '/' ? `/${locale}` : `/${locale}${path}`]
        }),
      ),
    },
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const now = new Date()

  const [listings, articles, issues] = await Promise.all([
    findAllListingSlugs(),
    findAllArticleSlugs(),
    findAllIssueSlugs(),
  ])

  const entries: MetadataRoute.Sitemap = []

  const push = (
    path: string,
    changeFrequency: (typeof CHANGE_FREQUENCY)[keyof typeof CHANGE_FREQUENCY],
    priority: number,
  ) => {
    const { url, alternates } = localized(path)
    entries.push({
      url: `${base}${url}`,
      lastModified: now,
      changeFrequency,
      priority,
      alternates: {
        languages: Object.fromEntries(
          Object.entries(alternates.languages).map(([locale, p]) => [locale, `${base}${p}`]),
        ),
      },
    })
  }

  // Landing pages first. Priority is a hint about relative importance within
  // this site, not a ranking lever - Google largely ignores it, but it costs
  // nothing and other crawlers do read it.
  push('/', CHANGE_FREQUENCY.index, 1)
  push('/directory', CHANGE_FREQUENCY.index, 0.9)

  /**
   * The seven sections, generated rather than listed.
   *
   * These are the pages a search for "boutique hotels Lebanon" should find, so
   * leaving them out would have meant the most valuable landing pages on the
   * site being reachable only by following a link from the header. Built from
   * `SECTIONS` so an eighth category cannot appear in the navigation and quietly
   * miss the sitemap.
   *
   * Ranked with the directory rather than below it: a section is a better answer
   * to a real search than "every listing in Lebanon" is.
   */
  for (const section of SECTIONS) push(`/${section.path}`, CHANGE_FREQUENCY.index, 0.9)

  push('/magazine', CHANGE_FREQUENCY.index, 0.9)
  push('/magazine/articles', CHANGE_FREQUENCY.index, 0.7)
  push('/magazine/issues', CHANGE_FREQUENCY.index, 0.7)

  /**
   * The standing pages. Low priority next to a listing, but they have to be in
   * here: "add your business" is a page somebody searches for by name, and it
   * is the only route into the directory for a business that is not in it yet.
   */
  for (const slug of CONTENT_PAGE_SLUGS) push(`/${slug}`, CHANGE_FREQUENCY.article, 0.5)

  for (const slug of listings) push(`/directory/${slug}`, CHANGE_FREQUENCY.listing, 0.8)
  for (const slug of articles) push(`/magazine/articles/${slug}`, CHANGE_FREQUENCY.article, 0.6)
  for (const slug of issues) push(`/magazine/issues/${slug}`, CHANGE_FREQUENCY.issue, 0.5)

  return entries
}
