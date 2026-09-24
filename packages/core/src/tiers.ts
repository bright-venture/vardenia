/**
 * Listing tiers - the commercial model expressed as code.
 *
 * Everything a paying advertiser gets is declared here, and the UI reads these
 * capabilities rather than hardcoding `if (tier === 'premium')` in twelve places.
 * When sales invents a new package, add a tier here; do not special-case it in
 * a component.
 */

/**
 * Three tiers, in enum order, each one the tier below plus one thing.
 *
 * - `online`: the listing on the website, and nothing in print. For a venue
 *   that wants to be found online but does not buy a magazine page.
 * - `free`: a page in the printed magazine. The website listing comes with it
 *   at no extra cost, which is where the name comes from: the venue pays for
 *   print, and online is free. Every listing imported from the magazine lands
 *   here, so it is also the default.
 * - `featured`: everything `free` has, plus a place in the band at the top of
 *   the home page. The band has room for {@link FEATURED_PLACES} listings, so
 *   the admin refuses a featured listing beyond that number.
 *
 * Before this there were two tiers, free and featured, and free meant unpaid
 * inventory. That changed when the team decided the website listing is what a
 * magazine page includes, and that the website on its own is something a venue
 * can buy. Every tier is now a paid one.
 *
 * The order matters beyond readability: the directory sorts on `-tier`, which
 * is the Postgres enum's own declaration order, so a magazine listing rises above
 * an online-only one and a featured listing above both. The migration that adds
 * `online` puts it BEFORE `free` in the enum for that reason.
 */
export const LISTING_TIERS = ['online', 'free', 'featured'] as const
export type ListingTier = (typeof LISTING_TIERS)[number]

/**
 * How many featured listings the home page shows, and so how many can be sold.
 *
 * A featured listing that never appears in the band has been sold something it
 * does not get: the band is sorted by name and cut at this number, so the
 * seventh would silently lose out to whichever six come first in the alphabet.
 * The admin refuses the seventh instead. Raise this and the band grows with it.
 */
export const FEATURED_PLACES = 6

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
  /**
   * The website listing on its own. It is a paid tier, so the listing page is
   * the full one - gallery and the scan report included - and what it lacks is
   * print, which is what the tier above sells.
   */
  online: {
    rank: 0,
    galleryLimit: 15,
    editorialFeature: false,
    analyticsAccess: true,
    heroPlacement: false,
    printInclusion: false,
    pushCampaigns: false,
  },
  /**
   * A page in the magazine, with the website listing included. The magazine
   * page is the editorial feature, so both flags go together.
   */
  free: {
    rank: 5,
    galleryLimit: 15,
    editorialFeature: true,
    analyticsAccess: true,
    heroPlacement: false,
    printInclusion: true,
    pushCampaigns: false,
  },
  /**
   * The magazine tier plus the home page. `heroPlacement` is the band at the top
   * of the home page, limited to FEATURED_PLACES listings; priority in every
   * listing grid comes with it through the `-tier` sort.
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
 * Unknown or missing values fall to the lowest tier, `online`, rather than
 * throwing. Failing closed matters: the alternative is a listing with a corrupt
 * tier quietly receiving print and the home page, which are what the tiers
 * above are paid for.
 */
export function tierOf(value: unknown): ListingTier {
  return LISTING_TIERS.includes(value as ListingTier) ? (value as ListingTier) : LISTING_TIERS[0]
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
