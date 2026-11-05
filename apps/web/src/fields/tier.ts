/**
 * The listing tier, and the rule that keeps gold to the places there are.
 *
 * The tiers and what each buys are declared in packages/core/src/tiers. This
 * file is the admin's side of them: the labels staff choose from, and the check
 * that stops one more gold listing being sold than the home page band shows
 * (the number in the admin's Settings, Tiers section: globals/Settings).
 *
 * Home page placement used to be a separate Featured box either tier could
 * tick. It is the gold tier now, so a website-only listing can no longer be
 * bought above the magazine ones (see the note in packages/core/src/tiers).
 */

import type { SelectField, SelectFieldSingleValidation } from 'payload'
import { select } from 'payload/shared'
import { HOME_PAGE_PLACES, LISTING_TIERS, type ListingTier } from '@vardenia/core'
import { isAdminFieldLevel } from '../access/index'
import { goldPlaces } from '../lib/gold-places'

/**
 * Spelled out, because a ladder name says where a tier sits but not what it
 * contains. Staff choosing a tier should not have to remember which rung has
 * the magazine page.
 */
export const TIER_LABELS: Record<ListingTier, string> = {
  bronze: 'Bronze (website only, no magazine page, no QR code)',
  silver: 'Silver (magazine page, website included)',
  gold: 'Gold (silver, plus first in every list and the home page)',
}

/**
 * Whether one more gold listing fits, given how many others hold a place.
 *
 * Separate from the validator so the arithmetic can be tested without a
 * database, and so the message is written once.
 */
export function goldPlaceCheck(
  othersGold: number,
  places: number = HOME_PAGE_PLACES,
): string | true {
  if (othersGold < places) return true
  return `The home page shows ${places} gold listings and all ${places} places are taken. Move one of them to silver first, or add places in Settings, Commission and tiers.`
}

/**
 * Payload's own select validation first, then the place count.
 *
 * Only choosing gold takes a place. A listing that is already gold keeps its
 * place on every later save, even if the count has somehow gone over -
 * refusing an unrelated edit to a paying listing would be the wrong way to
 * surface that.
 *
 * Drafts count. A gold listing saved as a draft has been sold the place, and
 * publishing it must not be the moment the band turns out to be full.
 */
export const validateTier: SelectFieldSingleValidation = async (value, options) => {
  const valid = await select(value, options)
  if (valid !== true) return valid
  if (value !== 'gold' || options.previousValue === 'gold') return true

  const { req, id } = options
  const { totalDocs } = await req.payload.count({
    collection: 'businesses',
    where: {
      and: [{ tier: { equals: 'gold' } }, ...(id == null ? [] : [{ id: { not_equals: id } }])],
    },
    overrideAccess: true,
    req,
  })

  return goldPlaceCheck(totalDocs, await goldPlaces(req.payload, req))
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
      'Bronze: the website only, with no QR code. Silver: a magazine page and its QR code, with the website included. Gold: silver, plus first place in every list and a place on the home page, whose number of places is set in Settings, Commission and tiers. Every silver listing comes before every bronze one.',
  },
}
