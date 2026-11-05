import type { GlobalConfig, NumberFieldSingleValidation } from 'payload'
import { number } from 'payload/shared'
import { HOME_PAGE_PLACES } from '@vardenia/core'
import { isAdmin, isStaff } from '../access/index'
import { clearListingsCache } from '../hooks/revalidateListings'

/**
 * How many gold listings there can be, which is how many the home page band
 * shows (packages/core/src/tiers).
 *
 * A page of its own rather than the constant in code, because it is a sales
 * decision: how many home page places to sell. Empty uses the default,
 * HOME_PAGE_PLACES, so a fresh database behaves as the code always did.
 *
 * Both sides read it: the band shows this many (lib/listings), and the tier
 * field refuses one more gold listing beyond it (fields/tier). Saving clears
 * the cached listings, so the home page follows on its next view.
 *
 * Staff can read it, as they can every commercial setting; only an admin
 * changes it.
 */

/** The most the band can sensibly hold: two rows of a wide screen, many swipes on a phone. */
export const MAX_GOLD_PLACES = 24

/**
 * A number of places that every gold listing already sold still fits in.
 *
 * Lowering it below the gold listings there are would leave some of them paid
 * for and off the home page, cut by name. So it is refused, with the way out.
 * Separate from the validator so the rule can be tested without a database.
 */
export function placesFloorCheck(places: number, goldListings: number): string | true {
  if (places >= goldListings) return true
  return `There are ${goldListings} gold listings, so the home page needs at least ${goldListings} places. Move ${goldListings - places} of them to silver first.`
}

const validatePlaces: NumberFieldSingleValidation = async (value, options) => {
  const valid = await number(value, options)
  if (valid !== true) return valid
  if (value === null || value === undefined) return true
  const { totalDocs } = await options.req.payload.count({
    collection: 'businesses',
    // Drafts count: a gold draft has been sold its place, as in fields/tier.
    where: { tier: { equals: 'gold' } },
    overrideAccess: true,
    req: options.req,
  })
  return placesFloorCheck(value, totalDocs)
}

export const TierSettings: GlobalConfig = {
  slug: 'tier-settings',
  label: 'Tiers',
  admin: {
    group: 'Directory',
    description:
      'Bronze is the website only, silver adds a page in the magazine, and gold adds first place in every list and a place in the band at the top of the home page. Every silver listing comes before every bronze one.',
  },
  access: { read: isStaff, update: isAdmin },
  hooks: {
    afterChange: [
      async ({ doc }) => {
        await clearListingsCache()
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'goldPlaces',
      label: 'Gold places on the home page',
      type: 'number',
      min: 1,
      max: MAX_GOLD_PLACES,
      admin: {
        step: 1,
        placeholder: String(HOME_PAGE_PLACES),
        description: `How many gold listings the home page shows, and so how many can be sold. A listing cannot be moved to gold once they are all taken, and the number cannot go below the gold listings there are. Empty: ${HOME_PAGE_PLACES}.`,
      },
      validate: validatePlaces,
    },
  ],
}
