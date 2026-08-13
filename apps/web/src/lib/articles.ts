import { cache } from 'react'
import { getPayload } from 'payload'
import type { Locale } from '@vardenia/i18n'
import config from '../payload.config'

/**
 * Read side for editorial.
 *
 * Same rule as listings: every query runs with `overrideAccess: false`, so
 * Payload applies anonymous permissions and unpublished drafts never reach a
 * page. An editor's half-written feature cannot leak by someone guessing a slug.
 */

export type Article = NonNullable<Awaited<ReturnType<typeof findArticleBySlug>>>

const client = async () => getPayload({ config })

/** Deduped per request: generateMetadata and the page body both load it. */
export const findArticleBySlug = cache(async (slug: string, locale: Locale) => {
  const payload = await client()
  const result = await payload.find({
    collection: 'articles',
    where: { slug: { equals: slug } },
    locale,
    // Deep enough to resolve hero image, the issue, and the hero images of any
    // featured listings, which the cards need.
    depth: 3,
    limit: 1,
    overrideAccess: false,
  })
  return result.docs[0] ?? null
})

/** Slugs for static generation. Published only, because that is all this returns. */
export async function findAllArticleSlugs() {
  const payload = await client()
  const result = await payload.find({
    collection: 'articles',
    limit: 1000,
    depth: 0,
    pagination: false,
    overrideAccess: false,
  })
  return result.docs.map((doc) => doc.slug).filter((slug): slug is string => Boolean(slug))
}

export async function findArticles({
  locale,
  page = 1,
  perPage = 24,
}: {
  locale: Locale
  page?: number
  perPage?: number
}) {
  const payload = await client()
  return payload.find({
    collection: 'articles',
    locale,
    depth: 1,
    page,
    limit: perPage,
    // Newest first, falling back to creation order for anything undated.
    sort: ['-publishedAt', '-createdAt'],
    overrideAccess: false,
  })
}
