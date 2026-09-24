/**
 * The listing tier, and the rule that keeps featured to the places there are.
 *
 * The three tiers and what each buys are declared in packages/core/src/tiers.
 * This file is the admin's side of them: the labels staff choose from, and the
 * check that stops a seventh featured listing being sold into a home page band
 * that shows six.
 */

import type { SelectField, SelectFieldSingleValidation } from 'payload'
import { select } from 'payload/shared'
import { FEATURED_PLACES, LISTING_TIERS, type ListingTier } from '@vardenia/core'
import { isAdminFieldLevel } from '../access/index'

/**
 * Spelled out, because the stored names are not self-explanatory: `free` is a
 * paid tier, named for the website listing that comes free with a magazine
 * page. A label that says only "Free" invites somebody to give it away.
 */
export const TIER_LABELS: Record<ListingTier, string> = {
  online: 'Online only (website, no magazine page)',
  free: 'Free (magazine page, website included)',
  featured: 'Featured (magazine page, website and home page)',
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
  return `The home page shows ${places} featured listings and all ${places} places are taken. Move one of them to another tier first.`
}

/**
 * Payload's own select validation first, then the place count.
 *
 * Only a move *to* featured takes a place. A listing that is already featured
 * keeps its place on every later save, even if the count has somehow gone over
 * - refusing an unrelated edit to a paying listing would be the wrong way to
 * surface that.
 *
 * Drafts count. A featured listing saved as a draft has been sold the place,
 * and publishing it must not be the moment the band turns out to be full.
 */
export const validateTier: SelectFieldSingleValidation = async (value, options) => {
  const valid = await select(value, options)
  if (valid !== true) return valid
  if (value !== 'featured' || options.previousValue === 'featured') return true

  const { req, id } = options
  const { totalDocs } = await req.payload.count({
    collection: 'businesses',
    where: {
      and: [{ tier: { equals: 'featured' } }, ...(id == null ? [] : [{ id: { not_equals: id } }])],
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
  defaultValue: 'free',
  index: true,
  access: { update: isAdminFieldLevel },
  options: LISTING_TIERS.map((tier) => ({ label: TIER_LABELS[tier], value: tier })),
  validate: validateTier,
  admin: {
    description: `Online only: the website. Free: a magazine page, with the website included. Featured: the magazine tier plus the home page, which has ${FEATURED_PLACES} places.`,
  },
}
