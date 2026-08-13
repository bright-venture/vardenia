import { cache } from 'react'
import { getPayload } from 'payload'
import type { Locale } from '@vardenia/i18n'
import config from '../payload.config'

/**
 * Read side for print editions.
 *
 * Issues have no draft state, unlike articles: an edition either exists or it
 * does not. So these queries are simpler than the editorial ones, but they still
 * run with `overrideAccess: false` so the rule stays uniform across every public
 * page. One exception is one too many to remember.
 */

export type Issue = NonNullable<Awaited<ReturnType<typeof findIssueBySlug>>>

const client = async () => getPayload({ config })

export async function findIssues(locale: Locale) {
  const payload = await client()
  return payload.find({
    collection: 'issues',
    locale,
    depth: 1,
    // Newest edition first, which is what a reader wants; the archive runs down.
    sort: ['-issueNumber'],
    limit: 100,
    overrideAccess: false,
  })
}

/** Deduped per request: generateMetadata and the page body both load it. */
export const findIssueBySlug = cache(async (slug: string, locale: Locale) => {
  const payload = await client()
  const result = await payload.find({
    collection: 'issues',
    where: { slug: { equals: slug } },
    locale,
    depth: 1,
    limit: 1,
    overrideAccess: false,
  })
  return result.docs[0] ?? null
})

/** Slugs for static generation. Published only, because that is all this returns. */
export async function findAllIssueSlugs() {
  const payload = await client()
  const result = await payload.find({
    collection: 'issues',
    limit: 500,
    depth: 0,
    pagination: false,
    overrideAccess: false,
  })
  return result.docs.map((doc) => doc.slug).filter((slug): slug is string => Boolean(slug))
}

/**
 * Every article printed in one edition, in page order.
 *
 * Page order, not publication order: this is a table of contents for a physical
 * object, so it should read the way the magazine reads. Articles with no page
 * number fall to the end rather than being hidden.
 */
export async function findArticlesInIssue(issueId: number | string, locale: Locale) {
  const payload = await client()
  const result = await payload.find({
    collection: 'articles',
    where: { 'print.issue': { equals: issueId } },
    locale,
    depth: 1,
    limit: 200,
    sort: ['print.pageFrom'],
    overrideAccess: false,
  })
  return result.docs
}
