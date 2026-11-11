import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import { dataLocale, type Locale } from '@vardenia/i18n'
import config from '../payload.config'
import type { ListingSummary } from './listings'

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
    locale: dataLocale(locale),
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
    locale: dataLocale(locale),
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
    locale: dataLocale(locale),
    depth: 1,
    limit: 200,
    sort: ['print.pageFrom'],
    overrideAccess: false,
  })
  return result.docs
}

/**
 * Every listing printed in one edition, by name (11 November 2026).
 *
 * A listing is in an issue when its printed QR code is: the code's `issue` is
 * what the print sheet filters on and what marks a code as printed, so it is
 * the one record of which places the magazine carries.
 *
 * The codes are read with `overrideAccess` because the QR collection is
 * staff-only (it holds redirect targets and scan counts); only the listing ids
 * leave that query, as in `printedCodes`. The listings themselves are read
 * under the public rule, so a listing taken back to draft drops off the page.
 *
 * Cached for the hour under the `businesses` tag, so a renamed or unpublished
 * listing clears it the way it clears the directory.
 */
export async function findListingsInIssue(
  issueId: number,
  locale: Locale,
): Promise<ListingSummary[]> {
  const run = async (): Promise<ListingSummary[]> => {
    const payload = await client()
    const codes = await payload.find({
      collection: 'qr-codes',
      where: {
        and: [
          { issue: { equals: issueId } },
          { targetType: { equals: 'business' } },
          { active: { equals: true } },
        ],
      },
      depth: 0,
      limit: 5000,
      pagination: false,
      overrideAccess: true,
      select: { business: true },
    })
    const ids = [
      ...new Set(
        codes.docs
          .map((doc) => (typeof doc.business === 'object' ? doc.business?.id : doc.business))
          .filter((id): id is number => typeof id === 'number'),
      ),
    ]
    if (ids.length === 0) return []

    const result = await payload.find({
      collection: 'businesses',
      where: { id: { in: ids } },
      locale: dataLocale(locale),
      depth: 1,
      limit: ids.length,
      pagination: false,
      // Drafts are excluded by the collection's own access rule.
      overrideAccess: false,
      sort: ['name'],
    })
    return result.docs as ListingSummary[]
  }

  return unstable_cache(run, ['issue-listings', String(issueId), locale], {
    revalidate: 60 * 60,
    tags: ['businesses', 'issues'],
  })()
}
