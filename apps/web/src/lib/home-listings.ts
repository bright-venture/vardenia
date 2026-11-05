import { unstable_cache } from 'next/cache'
import { getPayload, type Where } from 'payload'
import { dataLocale, type Locale } from '@vardenia/i18n'
import config from '../payload.config'
import type { Business } from '../payload-types'
import { findEvery } from './find-every'
import { isHomeCandidate, selectHomePlaces, type HomeCandidate } from './home-selection'
import { reportError } from './report'

export type HomeListing = Pick<
  Business,
  | 'id'
  | 'slug'
  | 'name'
  | 'tagline'
  | 'category'
  | 'governorate'
  | 'district'
  | 'verified'
  | '_status'
  | 'heroImage'
>

const eligible: Where = {
  and: [{ _status: { equals: 'published' } }, { verified: { equals: true } }],
}

/**
 * Separate from the paid Featured band. A narrow candidate index chooses the
 * mix; only the six displayed records load card copy and resized media. Public
 * access rules stay on for both queries. No database writes or curation flags.
 */
export async function findHomeListings({
  locale,
  excludedIds = [],
}: {
  locale: Locale
  excludedIds?: number[]
}): Promise<HomeListing[]> {
  const excluded = [...new Set(excludedIds)].sort((a, b) => a - b)
  const run = async (): Promise<HomeListing[]> => {
    const payload = await getPayload({ config })
    const candidates = await findEvery<HomeCandidate>(
      payload,
      {
        collection: 'businesses',
        where: eligible,
        locale: dataLocale(locale),
        depth: 1,
        overrideAccess: false,
        sort: 'id',
        select: {
          slug: true,
          name: true,
          category: true,
          governorate: true,
          verified: true,
          _status: true,
          heroImage: true,
        },
        // Only enough media to distinguish a photograph from the import stand-in.
        // Keep filename as well: Payload's storage adapters derive upload URLs
        // from it during afterRead, even when only the URL is consumed here.
        populate: { media: { url: true, filename: true, mimeType: true } },
      },
      // This is a selection, not an exhaustive count. Bound the index to 2,000
      // verified records, rather than loading an ever-growing full directory.
      4,
    )
    const picks = selectHomePlaces(candidates.docs, excluded)
    if (!picks.length) return []

    const result = await payload.find({
      collection: 'businesses',
      where: { and: [eligible, { id: { in: picks.map((listing) => listing.id) } }] },
      locale: dataLocale(locale),
      depth: 1,
      overrideAccess: false,
      limit: picks.length,
      pagination: false,
      select: {
        slug: true,
        name: true,
        tagline: true,
        category: true,
        governorate: true,
        district: true,
        verified: true,
        _status: true,
        heroImage: true,
      },
      // Keep complete media for these six cards. Storage adapters may need
      // their own prefix/object-key fields to generate the final public URLs.
    })
    const byId = new Map(result.docs.map((listing) => [listing.id, listing]))
    // A place may have been unpublished, unverified or lost its photograph
    // between reads. Drop it, preserving the selection order and never padding.
    return picks.flatMap((pick) => {
      const listing = byId.get(pick.id)
      return listing && isHomeCandidate(listing) ? [listing] : []
    })
  }

  try {
    return await unstable_cache(run, ['home-listings', locale, excluded.join(',')], {
      revalidate: 3600,
      tags: ['businesses', 'media'],
    })()
  } catch (error) {
    // Keep the rest of the homepage useful. A failed read is not an empty
    // directory, so do not show the old "directory is taking shape" message.
    await reportError(error, { source: 'listings.home-selection' })
    return []
  }
}
