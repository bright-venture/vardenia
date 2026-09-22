/**
 * Listing tiers - the commercial model expressed as code.
 *
 * Everything a paying advertiser gets is declared here, and the UI reads these
 * capabilities rather than hardcoding `if (tier === 'premium')` in twelve places.
 * When sales invents a new package, add a tier here; do not special-case it in
 * a component.
 */

/**
 * Two tiers, in enum order: everything, or nothing.
 *
 * There were four - free, listed, featured, partner - and they described a
 * sales organisation that does not exist. Nothing was ever sold into the middle
 * two: production held 1,276 free listings and a single `listed` one. Four
 * price points is a decision a team makes after it has learned what a venue
 * will pay, not before it has sold anything, and in the meantime each extra
 * tier was another row in a capability table nobody could explain to a
 * customer.
 *
 * So there is one thing to buy. A free listing is the seeded directory entry
 * that makes the catalogue complete on day one; a featured one is what a venue
 * pays for. The order matters beyond readability: the directory sorts on
 * `-tier`, which is the Postgres enum's own declaration order, so `featured`
 * must come after `free` for a paid listing to rise.
 */
export const LISTING_TIERS = ['free', 'featured'] as const
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
  /**
   * The one thing a venue buys, sold annually alongside the printed code.
   *
   * It absorbs what `listed` and `partner` used to offer, because splitting
   * those benefits across three prices was a guess at a market nobody had sold
   * into yet. `heroPlacement` is the visible half of it - the home page draws a
   * band of these - and priority in every listing grid is the other half, which
   * the `-tier` sort has always given for free.
   */
  featured: {
    rank: 10,
    galleryLimit: 15,
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
