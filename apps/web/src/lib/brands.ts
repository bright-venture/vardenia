import type { Payload } from 'payload'
import { MAX_BRANCHES_PER_BRAND } from '@vardenia/core'
import type { Locale } from '@vardenia/i18n'

/**
 * Restaurant brands, read for the public (served as JSON by
 * GET /brand-data/<slug>, app/brand-data) and grouped for the partner
 * dashboard (Task 9, 21 November 2026).
 */

export interface PublicBranch {
  id: number
  name: string
  slug: string
  address: string | null
  governorate: string | null
  city: string | null
  mapUrl: string | null
  /** [longitude, latitude], as Payload stores a point. */
  location: [number, number] | null
  openingHours: { day: string; opens: string | null; closes: string | null; closed: boolean }[]
  /** Whether the branch takes reservations through Vardenia. */
  bookingEnabled: boolean
}

export interface PublicBrand {
  name: string
  slug: string
  logo: { url: string; alt: string } | null
  description: string | null
  branches: PublicBranch[]
}

/** The shape a brand slug can take (fields/slug); anything else is not looked up. */
const SLUG_RE = /^[a-z0-9-]{1,200}$/

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null

const point = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length !== 2) return null
  const [lng, lat] = value.map(Number)
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng!, lat!] : null
}

const hours = (value: unknown): PublicBranch['openingHours'] =>
  Array.isArray(value)
    ? value.map((row: Record<string, unknown>) => ({
        day: String(row?.day ?? ''),
        opens: text(row?.opens),
        closes: text(row?.closes),
        closed: row?.closed === true,
      }))
    : []

/**
 * A brand and its published branches, as the public may see them, or null.
 *
 * Every read is a public one: `overrideAccess: false` with no user, so the
 * real read rules decide - brands with a published branch only
 * (collections/Brands brandsRead), published listings only
 * (publishedStaffOrOwned), team or attached media only (mediaRead). Payload
 * hides the trash by itself. The answer is then built field by field from an
 * explicit list, never by spreading a document, so nothing staff-only (tier,
 * contract, submission, booking capacity, QR code) can ride along even if a
 * read rule changes. Null for a malformed or unknown slug, and for a brand
 * whose `published` mirror is stale and has no published branch left.
 */
export async function publicBrand(
  payload: Payload,
  slug: string,
  locale: Locale,
): Promise<PublicBrand | null> {
  if (!SLUG_RE.test(slug)) return null

  const found = await payload.find({
    collection: 'brands',
    where: { slug: { equals: slug } },
    select: { name: true, slug: true, logo: true, description: true },
    limit: 1,
    depth: 0,
    locale,
    overrideAccess: false,
  })
  const brand = found.docs[0] as
    | { id: number; name?: unknown; slug?: unknown; logo?: unknown; description?: unknown }
    | undefined
  if (!brand) return null

  const listings = await payload.find({
    collection: 'businesses',
    where: { brand: { equals: brand.id } },
    select: {
      name: true,
      slug: true,
      address: true,
      governorate: true,
      city: true,
      mapUrl: true,
      location: true,
      openingHours: true,
      booking: { enabled: true },
    },
    sort: 'name',
    limit: MAX_BRANCHES_PER_BRAND,
    depth: 0,
    locale,
    overrideAccess: false,
  })
  if (listings.docs.length === 0) return null

  let logo: PublicBrand['logo'] = null
  const logoId =
    typeof brand.logo === 'number' || typeof brand.logo === 'string'
      ? brand.logo
      : ((brand.logo as { id?: number } | null)?.id ?? null)
  if (logoId !== null) {
    const media = await payload.find({
      collection: 'media',
      where: { id: { equals: logoId } },
      select: { url: true, alt: true },
      limit: 1,
      depth: 0,
      locale,
      overrideAccess: false,
    })
    const doc = media.docs[0] as { url?: unknown; alt?: unknown } | undefined
    const url = text(doc?.url)
    if (url) logo = { url, alt: text(doc?.alt) ?? '' }
  }

  return {
    name: String(brand.name ?? ''),
    slug: String(brand.slug ?? ''),
    logo,
    description: text(brand.description),
    branches: listings.docs.map((doc) => {
      const row = doc as Record<string, unknown>
      return {
        id: Number(row.id),
        name: String(row.name ?? ''),
        slug: String(row.slug ?? ''),
        address: text(row.address),
        governorate: text(row.governorate),
        city: text(row.city),
        mapUrl: text(row.mapUrl),
        location: point(row.location),
        openingHours: hours(row.openingHours),
        bookingEnabled: (row.booking as { enabled?: unknown } | null)?.enabled === true,
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// Partner dashboard
// ---------------------------------------------------------------------------

export interface BrandSummary {
  id: number
  name: string
  slug: string
  published: boolean
}

export interface BrandGroup<L> {
  /** Null for the listings that belong to no brand (or to one not found). */
  brand: BrandSummary | null
  listings: L[]
}

/**
 * The brands of a partner's listings, by id, for the dashboard. Read with
 * overrideAccess: the ids come from the partner's own listings (lib/session
 * ownerListings), and a partner sees their brand while it is still a draft.
 */
export async function brandSummaries(
  payload: Payload,
  ids: readonly (number | string)[],
  locale: Locale,
): Promise<BrandSummary[]> {
  const unique = [...new Set(ids.map(String))]
  if (unique.length === 0) return []
  const found = await payload.find({
    collection: 'brands',
    where: { id: { in: unique } },
    select: { name: true, slug: true, published: true },
    limit: unique.length,
    depth: 0,
    locale,
    overrideAccess: true,
  })
  return found.docs.map((doc) => {
    const row = doc as { id: number; name?: unknown; slug?: unknown; published?: unknown }
    return {
      id: Number(row.id),
      name: String(row.name ?? ''),
      slug: String(row.slug ?? ''),
      published: row.published === true,
    }
  })
}

/**
 * A partner's listings grouped by brand, for the dashboard: brands by name,
 * then the listings with no brand. Listing order is kept inside a group.
 * Pure; lib/session ownerBrandGroups feeds it.
 */
export function groupListingsByBrand<L extends { brandId: number | null }>(
  listings: readonly L[],
  brands: readonly BrandSummary[],
): BrandGroup<L>[] {
  const byId = new Map(brands.map((b) => [b.id, b]))
  const groups = new Map<number, BrandGroup<L>>()
  const loose: L[] = []
  for (const listing of listings) {
    const brand = listing.brandId === null ? undefined : byId.get(listing.brandId)
    if (!brand) {
      loose.push(listing)
      continue
    }
    const group = groups.get(brand.id) ?? { brand, listings: [] }
    group.listings.push(listing)
    groups.set(brand.id, group)
  }
  const named = [...groups.values()].sort((a, b) => a.brand!.name.localeCompare(b.brand!.name))
  return loose.length > 0 ? [...named, { brand: null, listings: loose }] : named
}
