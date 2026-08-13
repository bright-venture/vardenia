import { cache } from 'react'
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
 */
export async function findPages(locale: Locale) {
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
}
