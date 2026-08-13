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

export async function findPageBySlug(slug: string, locale: Locale) {
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
