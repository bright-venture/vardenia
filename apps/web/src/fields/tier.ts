/**
 * The listing tier, and the rules that keep gold and platinum to the places
 * there are.
 *
 * The tiers and what each buys are declared in packages/core/src/tiers. This
 * file is the admin's side of them: the labels staff choose from, and the checks
 * that stop one more platinum listing being sold than the home page band shows,
 * or one more gold listing than its category's top places (the two numbers in
 * the admin's Settings, Tiers section: globals/Settings).
 */

import type { SelectField, SelectFieldSingleValidation } from 'payload'
import { select } from 'payload/shared'
import {
  DEFAULT_MAX_GOLD_PER_CATEGORY,
  DEFAULT_MAX_PLATINUM,
  LISTING_TIERS,
  type ListingTier,
} from '@vardenia/core'
import { isAdminFieldLevel } from '../access/index'
import { tierLimits } from '../lib/tier-limits'

/**
 * Spelled out, because a ladder name says where a tier sits but not what it
 * contains. Staff choosing a tier should not have to remember which rung has
 * the magazine page.
 */
export const TIER_LABELS: Record<ListingTier, string> = {
  bronze: 'Bronze (website only, no magazine page, no QR code)',
  silver: 'Silver (magazine page, website included)',
  gold: 'Gold (silver, plus first place in its category)',
  platinum: 'Platinum (gold, plus a place on the home page)',
}

/**
 * Whether one more gold listing fits in its category, given how many others
 * there hold a place.
 *
 * Separate from the validator so the arithmetic can be tested without a
 * database, and so the message is written once.
 */
export function goldPlaceCheck(
  othersGold: number,
  places: number = DEFAULT_MAX_GOLD_PER_CATEGORY,
): string | true {
  if (othersGold < places) return true
  return `A category shows ${places} gold listings at the top and all ${places} places in this category are taken. Move one of them to silver first, or add places in Settings, Tiers.`
}

/** Whether one more platinum listing fits on the home page band. */
export function platinumPlaceCheck(
  othersPlatinum: number,
  places: number = DEFAULT_MAX_PLATINUM,
): string | true {
  if (othersPlatinum < places) return true
  return `The home page shows ${places} platinum listings and all ${places} places are taken. Move one of them to gold first, or add places in Settings, Tiers.`
}

/**
 * Payload's own select validation first, then the place count.
 *
 * Only choosing platinum or gold takes a place. A listing that already holds
 * its tier keeps its place on every later save, even if the count has somehow
 * gone over - refusing an unrelated edit to a paying listing would be the wrong
 * way to surface that. Platinum is counted overall; gold is counted among the
 * listings of the same category, and platinum ones do not count against it.
 *
 * Drafts count, and so does any status: a listing saved as a draft has been
 * sold the place, and publishing it must not be the moment the band turns out
 * to be full. Trashed listings are hidden from the count by Payload.
 */
export const validateTier: SelectFieldSingleValidation = async (value, options) => {
  const valid = await select(value, options)
  if (valid !== true) return valid
  if (value !== 'gold' && value !== 'platinum') return true
  // Platinum is global, so an unchanged tier keeps its place. Gold is per
  // category, so it also has to be unchanged in category (checked below).
  if (value === 'platinum' && options.previousValue === value) return true

  const { req, id } = options
  const others = id == null ? [] : [{ id: { not_equals: id } }]
  const limits = await tierLimits(req.payload, req)

  if (value === 'platinum') {
    const { totalDocs } = await req.payload.count({
      collection: 'businesses',
      where: { and: [{ tier: { equals: 'platinum' } }, ...others] },
      overrideAccess: true,
      req,
    })
    return platinumPlaceCheck(totalDocs, limits.maxPlatinum)
  }

  // The category being saved. A partial update may leave it out of `data`, and
  // the stored category is needed to tell a move between categories from an
  // unrelated edit, so read it from the saved listing.
  const saved =
    id == null
      ? null
      : ((await req.payload
          .findByID({
            collection: 'businesses',
            id,
            depth: 0,
            overrideAccess: true,
            trash: true,
            req,
          })
          .catch(() => null)) as { category?: unknown } | null)
  const given = (options.data as { category?: unknown } | undefined)?.category
  const category = typeof given === 'string' && given ? given : saved?.category
  // Fail closed: without a category the cap cannot be checked, and skipping it
  // silently would let any number of gold listings through.
  if (typeof category !== 'string' || !category) {
    return 'Choose a category before making a listing gold: the gold limit is counted per category.'
  }
  // Already gold and staying in the same category: it keeps its place.
  if (options.previousValue === 'gold' && saved?.category === category) return true
  const { totalDocs } = await req.payload.count({
    collection: 'businesses',
    where: { and: [{ tier: { equals: 'gold' } }, { category: { equals: category } }, ...others] },
    overrideAccess: true,
    req,
  })
  return goldPlaceCheck(totalDocs, limits.maxGoldPerCategory)
}

export const tierField: SelectField = {
  name: 'tier',
  type: 'select',
  required: true,
  // Every listing imported from the magazine is on this tier.
  defaultValue: 'silver',
  index: true,
  // Admin-only on create as well as update. With update alone, a listing made
  // by staff (or duplicated from a silver one) could start on any tier; denied,
  // the value falls back to the default above. The importer overrides access.
  access: { create: isAdminFieldLevel, update: isAdminFieldLevel },
  options: LISTING_TIERS.map((tier) => ({ label: TIER_LABELS[tier], value: tier })),
  validate: validateTier,
  admin: {
    components: { Cell: '/components/admin/ListCells#TierCell' },
    description:
      'Bronze: the website only, with no QR code. Silver: a magazine page and its QR code, with the website included. Gold: silver, plus first place in its category, limited per category in Settings, Tiers. Platinum: gold, plus a place on the home page, limited overall in Settings, Tiers. Every silver listing comes before every bronze one.',
  },
}
