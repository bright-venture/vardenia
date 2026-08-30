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
  /**
   * Push notification campaigns to nearby app users.
   *
   * False on every tier, deliberately, and kept in the shape so the intention is
   * not lost. The mobile app exists but has no push notification code and no
   * users, so there is nobody to notify. `partner` claimed this until 28 August
   * 2026, which meant the data model asserted something the product could not
   * do - and a sales sheet generated from it would have promised it.
   *
   * Turn it on for `partner` when the app ships and has an audience, not before.
   */
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
    // Not until the app has users. See the note on the field.
    pushCampaigns: false,
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
 * Expiry is handled by a person, not by this file.
 *
 * There was an `effectiveTier()` here that dropped a listing to `free` the
 * moment its contract end date passed. Nothing ever called it, and the team has
 * since decided the opposite: a lapsed listing keeps its tier until someone
 * changes it deliberately.
 *
 * That is a reasonable call. An automatic downgrade fires at midnight on a
 * renewal still being negotiated, quietly strips an advertiser's gallery back to
 * one photo, and the first anyone hears of it is the advertiser. A person
 * deciding is slower and never surprises a customer mid-conversation.
 *
 * The cost is that a lapsed listing keeps everything until noticed, so the
 * safeguard is visibility rather than automation: `contractEndsAt` is a sortable
 * column on the Businesses list, so sorting by it puts the expired accounts at
 * the top. If that stops being enough - if listings sit lapsed for months - the
 * answer is a report or a reminder, not a rule that acts behind the team's back.
 *
 * The function was deleted rather than left unused. A helper whose documentation
 * states a policy the team has rejected is worse than no helper: the next person
 * reads it as how the system behaves.
 */
