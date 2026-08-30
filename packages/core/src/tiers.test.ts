import { describe, expect, it } from 'vitest'
import { LISTING_TIERS, TIER_CAPABILITIES, can, tierOf } from './tiers'

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
        'analyticsAccess',
        'heroPlacement',
        'printInclusion',
        'pushCampaigns',
      ] as const) {
        if (below[flag]) {
          expect(above[flag], `${LISTING_TIERS[i]} lost ${flag}`).toBe(true)
        }
      }
    }
  })

  /** Free is the one that has to stay empty, because it is inventory. */
  it('gives the free tier nothing that costs the team anything', () => {
    const free = TIER_CAPABILITIES.free

    expect(free.editorialFeature).toBe(false)
    expect(free.printInclusion).toBe(false)
    expect(free.heroPlacement).toBe(false)
    expect(free.analyticsAccess).toBe(false)
    expect(free.galleryLimit).toBe(1)
  })

  /**
   * The scan report is what makes a renewal conversation possible, so it starts
   * at the first paid tier rather than being held back for the expensive ones.
   */
  it('includes the scan report from the first paid tier upwards', () => {
    expect(can(tierOf('listed'), 'analyticsAccess')).toBe(true)
    expect(can(tierOf('featured'), 'analyticsAccess')).toBe(true)
    expect(can(tierOf('partner'), 'analyticsAccess')).toBe(true)
  })

  /** Print is the reward for the step that matters commercially. */
  it('puts print inclusion at featured and above, not before', () => {
    expect(can(tierOf('listed'), 'printInclusion')).toBe(false)
    expect(can(tierOf('featured'), 'printInclusion')).toBe(true)
  })
})

describe('an unrecognised tier', () => {
  /**
   * Failing closed matters here for a commercial reason as well as a technical
   * one: the alternative is a listing with a corrupt tier quietly receiving
   * everything a partner pays for.
   */
  it('falls to free rather than throwing or granting anything', () => {
    for (const value of [undefined, null, '', 'premium', 'PARTNER', 42, {}]) {
      expect(tierOf(value), String(value)).toBe('free')
    }

    expect(can(tierOf('premium'), 'galleryLimit')).toBe(1)
    expect(can(tierOf('premium'), 'printInclusion')).toBe(false)
  })
})
