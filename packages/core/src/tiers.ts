/**
 * Listing tiers - the commercial model expressed as code.
 *
 * Everything a paying advertiser gets is declared here, and the UI reads these
 * capabilities rather than hardcoding `if (tier === 'premium')` in twelve places.
 * When sales invents a new package, add a tier here; do not special-case it in
 * a component.
 */

/**
 * Two tiers, in enum order, answering one question: is the venue in print?
 *
 * - `basic`: the listing on the website, and nothing in print. For a venue
 *   that wants to be found online but does not buy a magazine page.
 * - `silver`: a page in the printed magazine, with the website listing
 *   included. Every listing imported from the magazine lands here, so it is
 *   also the default.
 *
 * Named as a ladder (basic, silver) rather than for what they contain, because
 * those are the names sales uses with a venue, and a third rung - gold - has
 * somewhere obvious to go. The names were `online` and `free` for a day;
 * `free` meant "the website comes free with the magazine page", which read to
 * everyone as "costs nothing".
 *
 * # Featured is not a tier
 *
 * It is a separate `featured` flag on the listing, because it answers a
 * different question - is the venue on the home page? - and a website-only venue
 * can buy it as well as a magazine one. As a third tier it could only sit above
 * `silver`, which would have made "basic, but featured" impossible to
 * record without a fourth value, and every further add-on would have doubled
 * the list again. See {@link FEATURED_PLACES}.
 *
 * Every tier is paid. Before this there were two, free and featured, and free
 * meant unpaid inventory; that changed when the website listing became what a
 * magazine page includes, and the website on its own something a venue can buy.
 *
 * The order matters beyond readability: the directory sorts on `-featured`,
 * then `-tier`, and `-tier` is the Postgres enum's own declaration order, so a
 * magazine listing rises above a website-only one. `basic` is declared first
 * in the enum for that reason.
 */
export const LISTING_TIERS = ['basic', 'silver'] as const
export type ListingTier = (typeof LISTING_TIERS)[number]

/**
 * How many listings can be featured, which is how many the home page shows.
 *
 * Featured is an add-on either tier can buy: a place in the band at the top of
 * the home page, and first place in every listing grid. A featured listing that
 * never appears in the band has been sold something it does not get - the band
 * is sorted and cut at this number, so the seventh would silently lose out to
 * whichever six come first. The admin refuses the seventh instead. Raise this
 * and the band grows with it.
 */
export const FEATURED_PLACES = 6

export interface TierCapabilities {
  /** Sort weight in directory results. Higher floats to the top within a category. */
  rank: number
  /** Max images in the public gallery. */
  galleryLimit: number
  /** Gets a long-form editorial feature written by the Vardenia team. */
  editorialFeature: boolean
  /**
   * Gets a QR code. The code is printed beside the listing's magazine page, so
   * it comes with print: a website-only listing has nowhere for one to appear.
   * `ensureQrCode` mints one only for a tier that has this, and the print sheet
   * leaves out codes whose listing has moved to a tier without it.
   */
  qrCode: boolean
  /**
   * Scan performance is included in the report the team sends at renewal. Only
   * where there is a code to scan, so it follows `qrCode`.
   */
  analyticsAccess: boolean
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
   * Turn it on when the app ships and has an audience, not before.
   */
  pushCampaigns: boolean
}

/**
 * Home page placement is not in here: it belongs to the `featured` flag, which
 * either tier can carry, rather than to a tier.
 */
export const TIER_CAPABILITIES: Record<ListingTier, TierCapabilities> = {
  /**
   * The website listing on its own. It is a paid tier, so the listing page is
   * the full one, gallery included. What it lacks is print, which is what the
   * tier above sells, and with print the QR code and its scan report.
   */
  basic: {
    rank: 0,
    galleryLimit: 15,
    editorialFeature: false,
    qrCode: false,
    analyticsAccess: false,
    printInclusion: false,
    pushCampaigns: false,
  },
  /**
   * A page in the magazine, with the website listing included. The magazine
   * page is the editorial feature, so both flags go together.
   */
  silver: {
    rank: 5,
    galleryLimit: 15,
    editorialFeature: true,
    qrCode: true,
    analyticsAccess: true,
    printInclusion: true,
    // Not until the app has users. See the note on the field.
    pushCampaigns: false,
  },
}

/**
 * Coerce whatever the database hands back into a tier.
 *
 * Unknown or missing values fall to the lowest tier, `basic`, rather than
 * throwing. Failing closed matters: the alternative is a listing with a corrupt
 * tier quietly receiving print, which is what the tier above is paid for.
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
