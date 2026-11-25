import { getPayload } from 'payload'
import config from '../payload.config'
import { findEvery } from './find-every'

/** Public brand access requires a published branch. */
export async function findPublicBrandSlugs(): Promise<string[]> {
  const payload = await getPayload({ config })
  const result = await findEvery<{ slug?: string | null }>(payload, {
    collection: 'brands',
    overrideAccess: false,
    depth: 0,
    select: { slug: true },
  })
  if (!result.complete) throw new Error('The brand sitemap exceeds its pagination limit.')
  return result.docs.flatMap(({ slug }) => (slug ? [slug] : []))
}
