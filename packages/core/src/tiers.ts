/**
 * Listing tiers - the commercial model expressed as code.
 *
 * Everything a paying advertiser gets is declared here, and the UI reads these
 * capabilities rather than hardcoding `if (tier === 'premium')` in twelve places.
 * When sales invents a new package, add a tier here; do not special-case it in
 * a component.
 */

export const LISTING_TIERS = ['free', 'listed', 'featured', 'partner'] as const
export type ListingTier = (typeof LISTING_TIERS)[number]

export interface TierCapabilities {
  /** Sort weight in directory results. Higher floats to the top within a category. */
  rank: number
  /** Max images in the public gallery. */
  galleryLimit: number
  /** Gets a long-form editorial feature written by the Vardenia team. */
  editorialFeature: boolean
  /** Scan performance is included in the report the team sends at renewal. */
  analyticsAccess: boolean
  /** Eligible for homepage and category-hero placement. */
  heroPlacement: boolean
  /** Eligible to appear in the printed magazine. */
  printInclusion: boolean
  /** Push notification campaigns to nearby app users. */
  pushCampaigns: boolean
}

export const TIER_CAPABILITIES: Record<ListingTier, TierCapabilities> = {
  // Claimed-but-unpaid listing. Exists so the directory is complete on day one -
  // a thin directory sells nothing, so we seed it and upsell later.
  free: {
    rank: 0,
    galleryLimit: 1,
    editorialFeature: false,
    analyticsAccess: false,
    heroPlacement: false,
    printInclusion: false,
    pushCampaigns: false,
  },
  listed: {
    rank: 10,
    galleryLimit: 6,
    editorialFeature: false,
    analyticsAccess: true,
    heroPlacement: false,
    printInclusion: false,
    pushCampaigns: false,
  },
  featured: {
    rank: 20,
    galleryLimit: 15,
    editorialFeature: true,
    analyticsAccess: true,
    heroPlacement: true,
    printInclusion: true,
    pushCampaigns: false,
  },
  // Annual contract: airlines, hotel groups, tourism authorities.
  partner: {
    rank: 30,
    galleryLimit: 40,
    editorialFeature: true,
    analyticsAccess: true,
    heroPlacement: true,
    printInclusion: true,
    pushCampaigns: true,
  },
}

/**
 * Coerce whatever the database hands back into a tier.
 *
 * Unknown or missing values fall to `free` rather than throwing. Failing closed
 * matters: the alternative is a listing with a corrupt tier quietly receiving
 * everything a partner pays for.
 */
export function tierOf(value: unknown): ListingTier {
  return LISTING_TIERS.includes(value as ListingTier) ? (value as ListingTier) : 'free'
}

export function can<K extends keyof TierCapabilities>(
  tier: ListingTier,
  capability: K,
): TierCapabilities[K] {
  return TIER_CAPABILITIES[tier][capability]
}

/**
 * A listing's tier is only meaningful while its contract is live. Expired
 * contracts silently fall back to `free` rather than disappearing, so a lapsed
 * advertiser keeps a basic presence (and a reason to renew).
 */
export function effectiveTier(tier: ListingTier, contractEndsAt: Date | null, now = new Date()) {
  if (contractEndsAt === null) return tier === 'free' ? 'free' : tier
  return contractEndsAt.getTime() >= now.getTime() ? tier : 'free'
}
