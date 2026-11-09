import type { GlobalConfig, NumberFieldSingleValidation } from 'payload'
import { number } from 'payload/shared'
import { HOME_PAGE_PLACES } from '@vardenia/core'
import { isAdmin, isStaff } from '../access/index'
import { clearListingsCache } from '../hooks/revalidateListings'

/**
 * Settings, in the admin: every number the team sets for the business, on one
 * page, in three sections.
 *
 * - Commission: the default rate venues pay on what their guests spent, and
 *   the rate for reading a receipt in pounds as dollars (core/booking-fees).
 * - Tiers: how many gold listings the home page shows, and so how many can be
 *   sold (core/tiers).
 * - Accounts: a switch that pauses new customer sign-ups (lib/signups).
 *
 * These were two pages of one or two boxes each, one of them called
 * "Commissions" beside the billing screen of the same name, so the sidebar had
 * two "Commissions" that did different things. They are one page now, named
 * for what it holds, and the billing screen is "Monthly billing".
 *
 * Staff can read it, because the statements they draw up use it; only an
 * admin changes it, as with every other commercial setting.
 */

/** The most the home page band can sensibly hold: two rows of a wide screen, many swipes on a phone. */
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

export const Settings: GlobalConfig = {
  slug: 'settings',
  label: 'Commission, tiers and accounts',
  admin: {
    group: 'Settings',
    description:
      'The numbers the business runs on, and whether new accounts are open. Only an admin can change them; the team can read them.',
  },
  access: { read: isStaff, update: isAdmin },
  hooks: {
    // The gold places decide the home page band, which is cached with the
    // listings: clear it so a new number shows on the next view.
    afterChange: [
      async ({ doc }) => {
        await clearListingsCache()
        return doc
      },
    ],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Commission',
          description:
            'Each guest who books through Vardenia and comes is billed to the venue as a percentage of what they spent: the total on the receipt the guest sent, else what the venue entered, else what the guest says. Bills are prepared each month from Monthly billing.',
          fields: [
            {
              name: 'defaultRate',
              label: 'Commission rate (%)',
              type: 'number',
              min: 0,
              max: 100,
              admin: {
                step: 0.5,
                description:
                  'What every venue that takes bookings pays, unless its listing has a rate of its own (Commercial tab of the listing). Empty: nobody is billed.',
              },
            },
            {
              /**
               * For receipts in pounds. Commissions are billed in dollars and
               * the receipt's total comes first (core/billableAmount), so a
               * receipt in pounds needs a rate to count. Applied when the
               * receipt arrives, so a later change does not reprice a visit
               * already paid.
               */
              name: 'poundsPerDollar',
              label: 'Lebanese pounds per dollar',
              type: 'number',
              min: 0,
              admin: {
                step: 500,
                description:
                  "Today's rate, to read a guest's receipt in LBP as dollars. A receipt is converted on the day it arrives, so changing this later does not change visits already received. Empty: receipts in LBP are not used, and the venue's amount is billed instead.",
              },
            },
          ],
        },
        {
          label: 'Tiers',
          description:
            'Bronze is the website only, silver adds a page in the magazine, and gold adds first place in every list and a place in the band at the top of the home page. Every silver listing comes before every bronze one. A listing tier is set on its Commercial tab.',
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
        },
        {
          label: 'Accounts',
          description:
            'Whether readers can open a new account on the site. Everyone who already has one can still sign in, book and reset a password.',
          fields: [
            {
              // Read by lib/signups, for /auth/signup and the sign-up page.
              name: 'signupsPaused',
              label: 'Pause new accounts',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                description:
                  'Ticked: nobody can create an account, and the sign-up page says so. A booking needs an account, so new readers cannot book until this is unticked. Takes effect at once.',
              },
            },
          ],
        },
      ],
    },
  ],
}
