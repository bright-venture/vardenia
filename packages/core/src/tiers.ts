/**
 * Listing tiers - the commercial model expressed as code.
 *
 * Everything a paying advertiser gets is declared here, and the UI reads these
 * capabilities rather than hardcoding `if (tier === 'premium')` in twelve places.
 * When sales invents a new package, add a tier here; do not special-case it in
 * a component.
 */

/**
 * Three tiers, in enum order, a ladder where each rung is above the last:
 *
 * - `bronze`: the listing on the website, and nothing in print. For a venue
 *   that wants to be found online but does not buy a magazine page.
 * - `silver`: a page in the printed magazine, with the website listing
 *   included. Every listing imported from the magazine lands here, so it is
 *   also the default.
 * - `gold`: silver, plus first place in every listing grid and one of the
 *   places in the band at the top of the home page ({@link HOME_PAGE_PLACES}).
 *
 * # Every silver listing comes before every bronze one
 *
 * That is the rule the ladder exists for. Until 5 November 2026 home page
 * placement was a separate `featured` flag either tier could buy, and the
 * directory sorted on it first, so a website-only listing that bought it rose
 * above every magazine listing. Sorting on the tier first instead would have
 * left a featured bronze listing behind a thousand silver ones, sold something
 * it could never show. So the flag became the top rung: only a magazine
 * listing can buy the top of the list, and every rung outranks the one below.
 *
 * The tiers were called `basic` and `silver` before that; `basic` became
 * `bronze` with the same meaning, and `tierOf` still reads the old name.
 *
 * Every tier is paid. Before this there were two, free and featured, and free
 * meant unpaid inventory; that changed when the website listing became what a
 * magazine page includes, and the website on its own something a venue can buy.
 *
 * The order matters beyond readability: every listing grid sorts on `-tier`,
 * and `-tier` is the Postgres enum's own declaration order, so gold comes
 * first, then silver, then bronze. Declare a new rung in its place on the
 * ladder, never at the end.
 */
export const LISTING_TIERS = ['bronze', 'silver', 'gold'] as const
export type ListingTier = (typeof LISTING_TIERS)[number]

/**
 * How many gold listings there can be, which is how many the home page band
 * shows.
 *
 * A gold listing that never appears in the band has been sold something it
 * does not get - the band is sorted and cut at this number, so the seventh
 * would silently lose out to whichever six come first. The admin refuses a
 * seventh gold listing instead. Raise this and the band grows with it.
 */
export const HOME_PAGE_PLACES = 6

export interface TierCapabilities {
  /** Sort weight in directory results. Higher floats to the top within a category. */
  rank: number
  /**
   * A place in the band at the top of the home page. Gold only, and limited to
   * {@link HOME_PAGE_PLACES} listings.
   */
  homePage: boolean
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

export const TIER_CAPABILITIES: Record<ListingTier, TierCapabilities> = {
  /**
   * The website listing on its own. It is a paid tier, so the listing page is
   * the full one, gallery included. What it lacks is print, which is what the
   * tier above sells, and with print the QR code and its scan report.
   */
  bronze: {
    rank: 0,
    homePage: false,
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
    homePage: false,
    galleryLimit: 15,
    editorialFeature: true,
    qrCode: true,
    analyticsAccess: true,
    printInclusion: true,
    // Not until the app has users. See the note on the field.
    pushCampaigns: false,
  },
  /**
   * Everything silver has, plus the top of every list and the home page band.
   * It includes the magazine page, so a website-only venue cannot buy the top
   * of the list without being in print.
   */
  gold: {
    rank: 10,
    homePage: true,
    galleryLimit: 15,
    editorialFeature: true,
    qrCode: true,
    analyticsAccess: true,
    printInclusion: true,
    pushCampaigns: false,
  },
}

/**
 * Coerce whatever the database hands back into a tier.
 *
 * `basic` is the old name of `bronze` and is read as it. Anything else unknown
 * or missing falls to the lowest tier, `bronze`, rather than throwing. Failing closed matters: the alternative is a listing with a corrupt
 * tier quietly receiving print, which is what the tier above is paid for.
 */
export function tierOf(value: unknown): ListingTier {
  if (value === 'basic') return 'bronze'
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
