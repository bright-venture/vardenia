import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import type { Locale } from '@vardenia/i18n'
import config from '../payload.config'

/**
 * Read side for standing site pages: About, Advertise, Privacy, Terms.
 *
 * Nothing to do with the pages of a printed issue. See collections/Pages.ts.
 *
 * `overrideAccess: false` on both queries, so the collection's own
 * `publishedOrStaff` rule decides what the public sees. A draft Privacy Policy
 * is exactly the kind of document that must not leak while it is being reviewed.
 */

const client = async () => getPayload({ config })

/** Deduped per request: generateMetadata and the page body both load it. */
export const findPageBySlug = cache(async (slug: string, locale: Locale) => {
  const payload = await client()
  const result = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug } },
    locale,
    depth: 1,
    limit: 1,
    overrideAccess: false,
  })
  return result.docs[0] ?? null
})

/** Slugs for static generation. Published only, because that is all this returns. */
export async function findAllPageSlugs() {
  const payload = await client()
  const result = await payload.find({
    collection: 'pages',
    limit: 200,
    depth: 0,
    pagination: false,
    overrideAccess: false,
  })
  return result.docs.map((doc) => doc.slug).filter((slug): slug is string => Boolean(slug))
}

/**
 * Published pages, for the footer.
 *
 * Sorted by title rather than by creation date: the footer is a reference list,
 * and a stable alphabetical order beats one that reshuffles whenever somebody
 * adds a page.
 *
 * Cached across requests, not just within one. The footer renders on every page
 * of the site, so this was a database round trip on every single render - about
 * a fifth of the queries behind a magazine page, to fetch four links that change
 * a few times a year.
 *
 * Fifteen minutes, deliberately longer than the 60s on the pages themselves.
 * Adding a site page is rare and never urgent; the content of one can be urgent,
 * which is why the page itself stays on the short window.
 */
const FOOTER_PAGES_TTL = 900

export const findPages = (locale: Locale) =>
  unstable_cache(
    async () => {
      const payload = await client()
      const result = await payload.find({
        collection: 'pages',
        locale,
        depth: 0,
        limit: 50,
        sort: ['title'],
        overrideAccess: false,
      })
      return result.docs
    },
    // Locale is in the key: the two footers hold different titles.
    ['footer-pages', locale],
    { revalidate: FOOTER_PAGES_TTL, tags: ['pages'] },
  )()
