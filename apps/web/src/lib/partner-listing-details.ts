import { cache } from 'react'
import { getPayload } from 'payload'
import { canHaveBrand } from '@vardenia/core'
import { dataLocale, type Locale } from '@vardenia/i18n'
import config from '../payload.config'
import { currentOwner } from './session'
import { toEditable, type EditableListing } from './partner-listing-read'

/**
 * What the partner "Listing details" and "Branches" pages read (Task 12a,
 * 21 November 2026). Server only.
 *
 * The owner's own listings (the ids on their account), read with access
 * overridden like lib/session ownerListings, in the page's language with no
 * fallback: the form edits that language's text, so it must show that
 * language's text, not the English it would fall back to.
 */

export type { EditableListing }

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

export const ownerEditableListings = cache(async (locale: Locale): Promise<EditableListing[]> => {
  const owner = await currentOwner()
  if (!owner || owner.businessIds.length === 0) return []
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'businesses',
    where: { id: { in: owner.businessIds } },
    limit: owner.businessIds.length,
    depth: 0,
    overrideAccess: true,
    locale: dataLocale(locale),
    fallbackLocale: false,
    sort: 'name',
    select: {
      name: true,
      subcategories: true,
      tagline: true,
      description: true,
      contact: true,
      address: true,
      mapUrl: true,
      amenities: true,
      payments: true,
      facilities: true,
      popularFacilities: true,
      propertyHighlights: true,
      stay: true,
      features: true,
      seatingAreas: true,
    },
  })
  // Name and stay in every language, for the required values (see toEditable).
  const all = await payload.find({
    collection: 'businesses',
    where: { id: { in: owner.businessIds } },
    limit: owner.businessIds.length,
    depth: 0,
    overrideAccess: true,
    locale: 'all',
    select: { name: true, stay: true },
  })
  return result.docs.map((doc) =>
    toEditable(
      doc as unknown as Record<string, unknown>,
      (all.docs.find((other) => String(other.id) === String(doc.id)) ?? null) as Record<
        string,
        unknown
      > | null,
    ),
  )
})

/**
 * Whether this partner owns a restaurant, for the Branches tab. Its own small
 * query (subcategories only), in the default language: names do not matter.
 */
export const ownsRestaurant = cache(async (): Promise<boolean> => {
  const owner = await currentOwner()
  if (!owner || owner.businessIds.length === 0) return false
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'businesses',
    where: { id: { in: owner.businessIds } },
    limit: owner.businessIds.length,
    depth: 0,
    overrideAccess: true,
    select: { subcategories: true },
  })
  return result.docs.some((doc) =>
    canHaveBrand(list((doc as { subcategories?: unknown }).subcategories)),
  )
})
