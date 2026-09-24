import { describe, expect, it } from 'vitest'
import { FEATURED_PLACES, LISTING_TIERS, TIER_CAPABILITIES, can, tierOf } from './tiers'

/**
 * The commercial model, asserted rather than assumed.
 *
 * This file is read by sales material as well as by the site, so a capability
 * set to true here is a promise somebody will make to a business. That is a
 * different kind of mistake from a rendering bug: it is discovered by a customer
 * asking for something we cannot do.
 */

describe('capabilities nobody may promise yet', () => {
  /**
   * The mobile app exists in the repository but has no push notification code
   * and no users, so there is nobody to notify. `partner` claimed this until
   * 28 August 2026 and a sales sheet built from these values would have carried
   * it. Turn it on when the app ships with an audience, and delete this test in
   * the same change.
   */
  it('offers push campaigns on no tier at all', () => {
    for (const tier of LISTING_TIERS) {
      expect(can(tierOf(tier), 'pushCampaigns'), tier).toBe(false)
    }
  })
})

describe('the ladder holds its shape', () => {
  /**
   * Every rung has to be worth more than the one below it, or there is no
   * reason to move up. Checked as a property rather than tier by tier, so a new
   * tier inserted in the middle cannot quietly break the progression.
   */
  it('never gives a cheaper tier more than a dearer one', () => {
    const ordered = LISTING_TIERS.map((tier) => TIER_CAPABILITIES[tier])

    for (let i = 1; i < ordered.length; i += 1) {
      const below = ordered[i - 1]!
      const above = ordered[i]!

      expect(above.rank, `${LISTING_TIERS[i]} rank`).toBeGreaterThan(below.rank)
      expect(above.galleryLimit, `${LISTING_TIERS[i]} gallery`).toBeGreaterThanOrEqual(
        below.galleryLimit,
      )

      for (const flag of [
        'editorialFeature',
        'qrCode',
        'analyticsAccess',
        'printInclusion',
        'pushCampaigns',
      ] as const) {
        if (below[flag]) {
          expect(above[flag], `${LISTING_TIERS[i]} lost ${flag}`).toBe(true)
        }
      }
    }
  })

  /**
   * The two tiers differ in one thing, print, which is how they are sold: the
   * website, or a magazine page with the website included. The QR code and its
   * scan report come with print, because the code is printed beside the page.
   * A difference the sales sheet cannot name in one line is one a customer
   * cannot be asked to pay for.
   */
  it('adds print, and the QR code that goes with it, for the magazine tier', () => {
    const { basic, silver } = TIER_CAPABILITIES

    expect(basic.printInclusion).toBe(false)
    expect(silver.printInclusion).toBe(true)
    expect(basic.qrCode).toBe(false)
    expect(silver.qrCode).toBe(true)

    // The website listing itself is the same on both.
    expect(basic.galleryLimit).toBe(silver.galleryLimit)
  })

  /**
   * Featured is a flag either tier can carry, not a tier. If it ever comes back
   * as one, "basic, but featured" stops being something the admin can
   * record - which is the reason it was taken out.
   */
  it('keeps featured out of the tiers', () => {
    expect(LISTING_TIERS).not.toContain('featured')
    for (const tier of LISTING_TIERS) {
      expect(Object.keys(TIER_CAPABILITIES[tier]), tier).not.toContain('heroPlacement')
    }
  })

  /**
   * The scan report counts scans of the listing's QR code, so a tier without a
   * code has nothing to report. Promising it to a basic listing would be
   * selling an empty page.
   */
  it('gives the scan report exactly where there is a code to scan', () => {
    for (const tier of LISTING_TIERS) {
      expect(can(tier, 'analyticsAccess'), tier).toBe(can(tier, 'qrCode'))
    }
  })

  /**
   * An unrecognised tier falls to basic, so it must not be handed a code: a
   * minted code is permanent, and one minted by mistake could end up on paper.
   */
  it('mints no code for an unrecognised tier', () => {
    expect(can(tierOf('nonsense'), 'qrCode')).toBe(false)
  })

  /**
   * The directory orders on `-tier`, which is the Postgres enum's declaration
   * order rather than anything this file computes. Reordering the array would
   * bury the magazine listings underneath the website-only ones.
   */
  it('declares the tiers cheapest first, which is what sorts the dearest first', () => {
    expect(LISTING_TIERS).toEqual(['basic', 'silver'])
  })

  it('has room on the home page for as many featured listings as it shows', () => {
    expect(FEATURED_PLACES).toBeGreaterThan(0)
    expect(Number.isInteger(FEATURED_PLACES)).toBe(true)
  })

  /**
   * `listed` and `partner` were retired when four tiers became two, and
   * `featured` when it became a flag instead of a tier. An unknown tier falls to the lowest, so such a listing loses its standing rather than
   * silently keeping a paid one.
   */
  it('treats a retired tier as the lowest rather than as something it no longer is', () => {
    for (const retired of ['listed', 'partner', 'featured', 'online', 'free']) {
      expect(tierOf(retired)).toBe('basic')
      expect(can(tierOf(retired), 'printInclusion')).toBe(false)
    }
  })
})

describe('an unrecognised tier', () => {
  /**
   * Failing closed matters here for a commercial reason as well as a technical
   * one: the alternative is a listing with a corrupt tier quietly receiving
   * everything a partner pays for.
   */
  it('falls to the lowest tier rather than throwing or granting print', () => {
    for (const value of [undefined, null, '', 'premium', 'featured', 'PARTNER', 42, {}]) {
      expect(tierOf(value), String(value)).toBe('basic')
    }

    expect(can(tierOf('premium'), 'printInclusion')).toBe(false)
  })
})
