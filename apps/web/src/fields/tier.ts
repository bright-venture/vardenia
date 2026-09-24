/**
 * The listing tier, the featured add-on, and the rule that keeps featured to
 * the places there are.
 *
 * The tiers and what each buys are declared in packages/core/src/tiers. This
 * file is the admin's side of them: the labels staff choose from, and the check
 * that stops a seventh featured listing being sold into a home page band that
 * shows six.
 *
 * Tier and featured are two fields because they are two questions. The tier
 * says whether the venue is in print; featured says whether it is on the home
 * page. Either tier can be featured.
 */

import type { CheckboxField, CheckboxFieldValidation, SelectField } from 'payload'
import { checkbox } from 'payload/shared'
import { FEATURED_PLACES, LISTING_TIERS, type ListingTier } from '@vardenia/core'
import { isAdminFieldLevel } from '../access/index'

/**
 * Spelled out, because a ladder name says where a tier sits but not what it
 * contains. Staff choosing a tier should not have to remember which rung has
 * the magazine page.
 */
export const TIER_LABELS: Record<ListingTier, string> = {
  basic: 'Basic (website only, no magazine page, no QR code)',
  silver: 'Silver (magazine page, website included)',
}

/**
 * Whether one more featured listing fits, given how many others hold a place.
 *
 * Separate from the validator so the arithmetic can be tested without a
 * database, and so the message is written once.
 */
export function featuredPlaceCheck(
  othersFeatured: number,
  places: number = FEATURED_PLACES,
): string | true {
  if (othersFeatured < places) return true
  return `The home page shows ${places} featured listings and all ${places} places are taken. Untick featured on one of them first.`
}

/**
 * Payload's own checkbox validation first, then the place count.
 *
 * Only ticking the box takes a place. A listing that is already featured keeps
 * its place on every later save, even if the count has somehow gone over -
 * refusing an unrelated edit to a paying listing would be the wrong way to
 * surface that.
 *
 * Drafts count. A featured listing saved as a draft has been sold the place,
 * and publishing it must not be the moment the band turns out to be full.
 */
export const validateFeatured: CheckboxFieldValidation = async (value, options) => {
  const valid = await checkbox(value, options)
  if (valid !== true) return valid
  if (value !== true || options.previousValue === true) return true

  const { req, id } = options
  const { totalDocs } = await req.payload.count({
    collection: 'businesses',
    where: {
      and: [{ featured: { equals: true } }, ...(id == null ? [] : [{ id: { not_equals: id } }])],
    },
    overrideAccess: true,
    req,
  })

  return featuredPlaceCheck(totalDocs)
}

export const tierField: SelectField = {
  name: 'tier',
  type: 'select',
  required: true,
  // Every listing imported from the magazine is on this tier.
  defaultValue: 'silver',
  index: true,
  access: { update: isAdminFieldLevel },
  options: LISTING_TIERS.map((tier) => ({ label: TIER_LABELS[tier], value: tier })),
  admin: {
    description:
      'Basic: the website only, with no QR code. Silver: a magazine page and its QR code, with the website included. Home page placement is the Featured box below, which either tier can have.',
  },
}

export const featuredField: CheckboxField = {
  name: 'featured',
  type: 'checkbox',
  defaultValue: false,
  index: true,
  access: { update: isAdminFieldLevel },
  validate: validateFeatured,
  admin: {
    description: `An add-on to either tier: a place at the top of the home page, and first place in every listing grid. The home page has ${FEATURED_PLACES} places, and the box cannot be ticked on a seventh listing.`,
  },
}
