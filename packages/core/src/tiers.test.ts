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
   * The scan report is what makes a renewal conversation possible, so the paid
   * tier gets it. There is only one, which is the point of the two-tier model:
   * nothing has to be held back to justify a tier above it.
   */
  it('gives the paid tier everything that is worth paying for', () => {
    expect(can(tierOf('featured'), 'analyticsAccess')).toBe(true)
    expect(can(tierOf('featured'), 'printInclusion')).toBe(true)
    expect(can(tierOf('featured'), 'heroPlacement')).toBe(true)
    expect(can(tierOf('featured'), 'editorialFeature')).toBe(true)
  })

  /**
   * `featured` has to sort above `free`, because the directory orders on
   * `-tier` and that is the Postgres enum's declaration order rather than
   * anything this file computes. Reversing the array would quietly bury every
   * paying listing underneath the free ones.
   */
  it('declares the paid tier after the free one, which is what sorts it first', () => {
    expect(LISTING_TIERS).toEqual(['free', 'featured'])
  })

  /**
   * `listed` and `partner` were retired when four tiers became two, and rows
   * carrying them exist until the migration rewrites them. An unknown tier
   * falls to `free`, so during that window such a listing loses its standing
   * rather than silently keeping a paid one.
   */
  it('treats a retired tier as free rather than as something it no longer is', () => {
    for (const retired of ['listed', 'partner']) {
      expect(tierOf(retired)).toBe('free')
      expect(can(tierOf(retired), 'heroPlacement')).toBe(false)
    }
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
