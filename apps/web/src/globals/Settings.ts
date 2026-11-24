import type { GlobalConfig, NumberFieldSingleValidation } from 'payload'
import { number } from 'payload/shared'
import { DEFAULT_MAX_GOLD_PER_CATEGORY, DEFAULT_MAX_PLATINUM } from '@vardenia/core'
import { isAdmin, isAdminFieldLevel, isStaff } from '../access/index'
import { clearListingsCache } from '../hooks/revalidateListings'
import { HIDEABLE_LABELS, HIDEABLE_PAGES } from '../lib/hideable-pages'

/**
 * Settings, in the admin: every number the team sets for the business, on one
 * page, in three sections.
 *
 * - Commission: the default rate venues pay on what their guests spent, and
 *   the rate for reading a receipt in pounds as dollars (core/booking-fees).
 * - Tiers: how many gold listings each category can hold, and how many platinum
 *   listings the home page shows, and so how many can be sold (core/tiers).
 * - Pages: standing pages hidden from the site while not ready (lib/hidden-pages).
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

/** The most a band or a category's top can sensibly hold: two rows of a wide screen, many swipes on a phone. */
export const MAX_TIER_PLACES = 24

/**
 * A platinum limit that every platinum listing already sold still fits in.
 *
 * Lowering it below the platinum listings there are would leave some of them
 * paid for and off the home page, cut by name. So it is refused, with the way
 * out. Separate from the validator so the rule can be tested without a database.
 */
export function platinumFloorCheck(places: number, platinumListings: number): string | true {
  if (places >= platinumListings) return true
  return `There are ${platinumListings} platinum listings, so the home page needs at least ${platinumListings} places. Move ${platinumListings - places} of them to gold first.`
}

/** The category holding the most gold listings, and how many, or null when there are none. */
export function highestPerCategory(
  goldListings: { category?: unknown }[],
): { category: string; count: number } | null {
  const counts = new Map<string, number>()
  for (const { category } of goldListings) {
    if (typeof category !== 'string') continue
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  let top: { category: string; count: number } | null = null
  for (const [category, count] of counts) {
    if (!top || count > top.count) top = { category, count }
  }
  return top
}

/** A gold limit that the fullest category already fits in. Refused otherwise, as for platinum. */
export function goldFloorCheck(
  places: number,
  fullest: { category: string; count: number } | null,
): string | true {
  if (!fullest || places >= fullest.count) return true
  return `The ${fullest.category} category has ${fullest.count} gold listings, so each category needs at least ${fullest.count} places. Move ${fullest.count - places} of them to silver first.`
}

export const validateMaxPlatinum: NumberFieldSingleValidation = async (value, options) => {
  const valid = await number(value, options)
  if (valid !== true) return valid
  if (value === null || value === undefined) return true
  const { totalDocs } = await options.req.payload.count({
    collection: 'businesses',
    // Drafts count: a platinum draft has been sold its place, as in fields/tier.
    where: { tier: { equals: 'platinum' } },
    overrideAccess: true,
    req: options.req,
  })
  return platinumFloorCheck(value, totalDocs)
}

export const validateMaxGold: NumberFieldSingleValidation = async (value, options) => {
  const valid = await number(value, options)
  if (valid !== true) return valid
  if (value === null || value === undefined) return true
  const { docs } = await options.req.payload.find({
    collection: 'businesses',
    where: { tier: { equals: 'gold' } },
    select: { category: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req: options.req,
  })
  return goldFloorCheck(value, highestPerCategory(docs))
}

/** Whether the list of hidden pages is different after a save, in any order. */
export function hiddenPagesChanged(before: unknown, after: unknown): boolean {
  const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []).sort().join(',')
  return list(before) !== list(after)
}

/**
 * Makes a change to the hidden pages show on the next view: drops the cached
 * list (lib/hidden-pages, tag "hidden-pages") and rebuilds every page, because
 * the header and footer on every page link to them. Only on that change, so
 * an ordinary save of a rate does not rebuild the whole site. Outside a Next
 * request (scripts, migrations) there is nothing cached, so a failure is fine.
 */
async function showHiddenPages() {
  try {
    const { revalidatePath, revalidateTag } = await import('next/cache')
    revalidateTag('hidden-pages', { expire: 0 })
    revalidatePath('/', 'layout')
  } catch {
    // Outside a Next request. Nothing is cached, so nothing needs clearing.
  }
}

export const Settings: GlobalConfig = {
  slug: 'settings',
  label: 'Site settings',
  admin: {
    group: 'Settings',
    description:
      'The numbers the business runs on, which pages are shown, and whether new accounts are open. Only an admin can change them; the team can read them.',
  },
  access: { read: isStaff, update: isAdmin },
  hooks: {
    // The platinum places decide the home page band, which is cached with the
    // listings: clear it so a new number shows on the next view.
    afterChange: [
      async ({ doc, previousDoc }) => {
        await clearListingsCache()
        if (hiddenPagesChanged(previousDoc?.hiddenPages, doc?.hiddenPages)) await showHiddenPages()
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
            'Bronze is the website only, silver adds a page in the magazine, gold adds first place in its category, and platinum adds a place in the band at the top of the home page. Every silver listing comes before every bronze one. A listing tier is set on its Commercial tab.',
          fields: [
            {
              name: 'maxGoldPerCategory',
              label: 'Gold listings per category',
              type: 'number',
              min: 1,
              max: MAX_TIER_PLACES,
              admin: {
                step: 1,
                placeholder: String(DEFAULT_MAX_GOLD_PER_CATEGORY),
                description: `How many gold listings each category can hold at the top, and so how many can be sold per category. A listing cannot be moved to gold once its category is full, and the number cannot go below the gold listings in the fullest category. Platinum listings do not count. Empty: ${DEFAULT_MAX_GOLD_PER_CATEGORY}.`,
              },
              validate: validateMaxGold,
            },
            {
              name: 'maxPlatinum',
              label: 'Platinum listings on the home page',
              type: 'number',
              min: 1,
              max: MAX_TIER_PLACES,
              admin: {
                step: 1,
                placeholder: String(DEFAULT_MAX_PLATINUM),
                description: `How many platinum listings the home page shows, and so how many can be sold in all. A listing cannot be moved to platinum once they are all taken, and the number cannot go below the platinum listings there are. Empty: ${DEFAULT_MAX_PLATINUM}.`,
              },
              validate: validateMaxPlatinum,
            },
          ],
        },
        {
          label: 'Pages',
          description:
            'Take a page off the site while it is not ready: a standing page, the magazine, a section or the directory. A hidden page shows "not found", and its links disappear from the header, the footer, the sitemap and the main buttons that lead to it. Hiding the directory keeps its listings up, hiding Partner sign in only removes the footer link, and hiding Sign in only removes the sign-in and account links from the header. Privacy, Terms and Credits only leave the footer: those pages stay up, since the sign-up form links to Privacy and Terms.',
          fields: [
            {
              // Read by lib/hidden-pages, for the page routes, the header,
              // the footer and the sitemap.
              name: 'hiddenPages',
              label: 'Hidden pages',
              type: 'select',
              hasMany: true,
              options: HIDEABLE_PAGES.map((value) => ({ label: HIDEABLE_LABELS[value], value })),
              admin: {
                description:
                  'Pick the pages to hide. Remove one from the list to show it again. Takes effect on the next view.',
              },
            },
          ],
        },
        {
          label: 'Magazine places',
          description:
            'The Magazine Places form: what a place pays, how long it lasts, how long an unfinished form is held, and the company number for Whish and WhatsApp. Read by lib/place-settings; the price and term are copied onto each submission when the owner accepts the terms, so changing them never rewrites an accepted one.',
          fields: [
            {
              name: 'magazinePlaces',
              type: 'group',
              // Only an admin reads or changes these (the global itself is
              // staff-readable).
              access: { read: isAdminFieldLevel, update: isAdminFieldLevel },
              fields: [
                { name: 'pricePerYear', type: 'number', min: 0, defaultValue: 20 },
                { name: 'currency', type: 'text', defaultValue: 'USD' },
                { name: 'termMonths', type: 'number', min: 1, defaultValue: 12 },
                { name: 'paymentDeadlineDays', type: 'number', min: 1, defaultValue: 7 },
                {
                  name: 'holdMinutes',
                  type: 'number',
                  min: 1,
                  defaultValue: 30,
                  admin: { description: 'How long an unfinished form keeps its listing number.' },
                },
                {
                  name: 'whishNumber',
                  type: 'text',
                  defaultValue: '+96179300350',
                  admin: { description: 'Used for Whish payments and WhatsApp.' },
                },
                { name: 'termsVersion', type: 'text', defaultValue: '2026-11' },
              ],
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
