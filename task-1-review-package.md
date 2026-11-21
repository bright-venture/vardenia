# Review package (working-tree snapshots, nothing committed)

## Stat

apps/web/src/components/admin/ListCells.tsx | 4 +-
apps/web/src/fields/tier.test.ts | 62 +++++++++++---
apps/web/src/fields/tier.ts | 82 ++++++++++++------
apps/web/src/globals/Settings.test.ts | 63 ++++++++++----
apps/web/src/globals/Settings.ts | 100 +++++++++++++++++-----
apps/web/src/import/photo-import.test.ts | 4 +-
apps/web/src/lib/gold-places.ts | 24 ------
apps/web/src/lib/listings.ts | 17 ++--
apps/web/src/lib/media.test.ts | 6 +-
apps/web/src/lib/performance-report.ts | 8 +-
apps/web/src/lib/tier-limits.ts | 48 +++++++++++
apps/web/src/payload-types.ts | 15 ++--
apps/web/src/seed/fixtures.test.ts | 20 +++--
apps/web/src/seed/fixtures.ts | 2 +-
docs/superpowers/plans/2026-11-20-core-backend.md | 42 +++++----
packages/core/src/tiers.test.ts | 48 ++++++++---
packages/core/src/tiers.ts | 67 +++++++++++----
17 files changed, 429 insertions(+), 183 deletions(-)

## Diff

diff --git a/apps/web/src/components/admin/ListCells.tsx b/apps/web/src/components/admin/ListCells.tsx
index 1626aea5..f6e5411f 100644
--- a/apps/web/src/components/admin/ListCells.tsx
+++ b/apps/web/src/components/admin/ListCells.tsx
@@ -6,27 +6,27 @@ import type { DefaultCellComponentProps } from 'payload'

- Cells for the admin lists, where Payload's defaults print the raw value.
-
- A tick box printed "true", a fee printed "64", a rating printed "5", and the
- tier printed its whole explanation, "Silver (magazine page, website
- included)", on two lines in every row. Each of these says the same thing the
- way a person reads it. Styles are in app/(payload)/custom.css.
  */

type Props = DefaultCellComponentProps

-/** "Gold", "Silver" or "Bronze", the higher rungs marked out. _/
+/_* "Platinum", "Gold", "Silver" or "Bronze", the higher rungs marked out. */
export function TierCell({ cellData }: Props) {
const tier = String(cellData ?? '')
if (!tier) return null
const name = tier.charAt(0).toUpperCase() + tier.slice(1)
const pill =

- tier === 'gold'

* tier === 'platinum' || tier === 'gold'
  ? 'vd-pill vd-pill--warn'
  : tier === 'silver'
  ? 'vd-pill vd-pill--ok'
  : 'vd-pill'
  return (
  <span className="vd-cell-pills">
  <span className={pill}>{name}</span>
  </span>
  )
  }
  diff --git a/apps/web/src/fields/tier.test.ts b/apps/web/src/fields/tier.test.ts
  index 2f1c2120..f7d179af 100644
  --- a/apps/web/src/fields/tier.test.ts
  +++ b/apps/web/src/fields/tier.test.ts
  @@ -1,49 +1,83 @@
  import { describe, expect, it } from 'vitest'
  -import { HOME_PAGE_PLACES, LISTING_TIERS } from '@vardenia/core'
  -import { TIER_LABELS, goldPlaceCheck } from './tier'
  +import { DEFAULT_MAX_GOLD_PER_CATEGORY, DEFAULT_MAX_PLATINUM, LISTING_TIERS } from '@vardenia/core'
  +import { TIER_LABELS, goldPlaceCheck, platinumPlaceCheck, tierField } from './tier'
  +import { HOME_PAGE_TIERS } from '../lib/tier-limits'

/**

- - The home page band shows HOME_PAGE_PLACES listings, the gold ones. A gold
- - listing beyond that number would be paid for and never shown, so the admin
- - refuses it instead.

* - Gold is the top of its category, with a cap per category. A gold listing
* - beyond that would be paid for and never shown first, so the admin refuses it.
    */
    -describe('gold places', () => {

- it('lets a listing in while a place is free', () => {
  +describe('gold places per category', () => {

* it('lets a listing in while the category has a place free', () => {
  expect(goldPlaceCheck(0)).toBe(true)

- expect(goldPlaceCheck(HOME_PAGE_PLACES - 1)).toBe(true)

* expect(goldPlaceCheck(DEFAULT_MAX_GOLD_PER_CATEGORY - 1)).toBe(true)
  })

- it('refuses one more once every place is taken', () => {
- const refusal = goldPlaceCheck(HOME_PAGE_PLACES)

* it('refuses one more once every place in the category is taken, naming the limit', () => {
* const refusal = goldPlaceCheck(DEFAULT_MAX_GOLD_PER_CATEGORY)
  expect(refusal).not.toBe(true)

- expect(refusal).toContain(String(HOME_PAGE_PLACES))

* expect(refusal).toContain(String(DEFAULT_MAX_GOLD_PER_CATEGORY))
* expect(refusal).toContain('category')
  })

it('refuses when the count has somehow gone over', () => {

- expect(goldPlaceCheck(HOME_PAGE_PLACES + 3)).not.toBe(true)

* expect(goldPlaceCheck(DEFAULT_MAX_GOLD_PER_CATEGORY + 3)).not.toBe(true)
  })

it('names the way out in its refusal', () => {

- expect(goldPlaceCheck(HOME_PAGE_PLACES)).toContain('Move one of them to silver')

* expect(goldPlaceCheck(DEFAULT_MAX_GOLD_PER_CATEGORY)).toContain('Move one of them to silver')
  })

it('follows a different number of places', () => {
expect(goldPlaceCheck(2, 3)).toBe(true)
expect(goldPlaceCheck(3, 3)).not.toBe(true)
})
})

+describe('platinum places overall', () => {

- it('lets a listing in while a place is free, and refuses at the limit', () => {
- expect(platinumPlaceCheck(DEFAULT_MAX_PLATINUM - 1)).toBe(true)
- const refusal = platinumPlaceCheck(DEFAULT_MAX_PLATINUM)
- expect(refusal).not.toBe(true)
- expect(refusal).toContain(String(DEFAULT_MAX_PLATINUM))
- expect(refusal).toContain('home page')
- })
-
- it('follows a different number of places', () => {
- expect(platinumPlaceCheck(2, 3)).toBe(true)
- expect(platinumPlaceCheck(3, 3)).not.toBe(true)
- })
  +})
-

describe('tier labels', () => {
/** * A ladder name says where a tier sits, not what it contains, so the label * carries both.
*/
it('says what each tier includes, not only its name', () => {
for (const tier of LISTING_TIERS) {
expect(TIER_LABELS[tier], tier).toMatch(/\(.+\)/)
}
expect(TIER_LABELS.silver).toContain('magazine')
expect(TIER_LABELS.bronze).toContain('no magazine')

- expect(TIER_LABELS.gold).toContain('home page')

* expect(TIER_LABELS.gold).toContain('category')
* expect(TIER_LABELS.platinum).toContain('home page')
* })
  +})
*

+describe('sort order and the home page band', () => {

- /**
- - Every listing grid sorts on `-tier`, the Postgres enum's declaration order,
- - which comes from these options. So the options must run bronze to
- - platinum, and `-tier` puts platinum, gold, silver, bronze.
- */
- it('declares the select options in ladder order, so -tier ranks platinum first', () => {
- const values = (tierField.options as { value: string }[]).map((o) => o.value)
- expect(values).toEqual(['bronze', 'silver', 'gold', 'platinum'])
- expect([...values].reverse()).toEqual(['platinum', 'gold', 'silver', 'bronze'])
- })
-
- it('draws the home page band from platinum only', () => {
- expect(HOME_PAGE_TIERS).toEqual(['platinum'])
  })
  })
  diff --git a/apps/web/src/fields/tier.ts b/apps/web/src/fields/tier.ts
  index 7740c1b3..6a3d6e80 100644
  --- a/apps/web/src/fields/tier.ts
  +++ b/apps/web/src/fields/tier.ts
  @@ -1,92 +1,120 @@
  /**

* - The listing tier, and the rule that keeps gold to the places there are.

- - The listing tier, and the rules that keep gold and platinum to the places
- - there are.
  -
  - The tiers and what each buys are declared in packages/core/src/tiers. This

* - file is the admin's side of them: the labels staff choose from, and the check
* - that stops one more gold listing being sold than the home page band shows
* - (the number in the admin's Settings, Tiers section: globals/Settings).
* -
* - Home page placement used to be a separate Featured box either tier could
* - tick. It is the gold tier now, so a website-only listing can no longer be
* - bought above the magazine ones (see the note in packages/core/src/tiers).

- - file is the admin's side of them: the labels staff choose from, and the checks
- - that stop one more platinum listing being sold than the home page band shows,
- - or one more gold listing than its category's top places (the two numbers in
- - the admin's Settings, Tiers section: globals/Settings).
    */

import type { SelectField, SelectFieldSingleValidation } from 'payload'
import { select } from 'payload/shared'
-import { HOME_PAGE_PLACES, LISTING_TIERS, type ListingTier } from '@vardenia/core'
+import {

- DEFAULT_MAX_GOLD_PER_CATEGORY,
- DEFAULT_MAX_PLATINUM,
- LISTING_TIERS,
- type ListingTier,
  +} from '@vardenia/core'
  import { isAdminFieldLevel } from '../access/index'
  -import { goldPlaces } from '../lib/gold-places'
  +import { tierLimits } from '../lib/tier-limits'

/**

- Spelled out, because a ladder name says where a tier sits but not what it
- contains. Staff choosing a tier should not have to remember which rung has
- the magazine page.
  */
  export const TIER_LABELS: Record<ListingTier, string> = {
  bronze: 'Bronze (website only, no magazine page, no QR code)',
  silver: 'Silver (magazine page, website included)',

* gold: 'Gold (silver, plus first in every list and the home page)',

- gold: 'Gold (silver, plus first place in its category)',
- platinum: 'Platinum (gold, plus a place on the home page)',
  }

/**

- - Whether one more gold listing fits, given how many others hold a place.

* - Whether one more gold listing fits in its category, given how many others
* - there hold a place.
  -
  - Separate from the validator so the arithmetic can be tested without a
  - database, and so the message is written once.
    */
    export function goldPlaceCheck(
    othersGold: number,

- places: number = HOME_PAGE_PLACES,

* places: number = DEFAULT_MAX_GOLD_PER_CATEGORY,
  ): string | true {
  if (othersGold < places) return true

- return `The home page shows ${places} gold listings and all ${places} places are taken. Move one of them to silver first, or add places in Settings, Commission and tiers.`

* return `A category shows ${places} gold listings at the top and all ${places} places in this category are taken. Move one of them to silver first, or add places in Settings, Tiers.`
  +}
*

+/** Whether one more platinum listing fits on the home page band. */
+export function platinumPlaceCheck(

- othersPlatinum: number,
- places: number = DEFAULT_MAX_PLATINUM,
  +): string | true {
- if (othersPlatinum < places) return true
- return `The home page shows ${places} platinum listings and all ${places} places are taken. Move one of them to gold first, or add places in Settings, Tiers.`
  }

/**

- Payload's own select validation first, then the place count.
-

* - Only choosing gold takes a place. A listing that is already gold keeps its
* - place on every later save, even if the count has somehow gone over -
* - refusing an unrelated edit to a paying listing would be the wrong way to
* - surface that.

- - Only choosing platinum or gold takes a place. A listing that already holds
- - its tier keeps its place on every later save, even if the count has somehow
- - gone over - refusing an unrelated edit to a paying listing would be the wrong
- - way to surface that. Platinum is counted overall; gold is counted among the
- - listings of the same category, and platinum ones do not count against it.
  -

* - Drafts count. A gold listing saved as a draft has been sold the place, and
* - publishing it must not be the moment the band turns out to be full.

- - Drafts count, and so does any status: a listing saved as a draft has been
- - sold the place, and publishing it must not be the moment the band turns out
- - to be full. Trashed listings are hidden from the count by Payload.
    */
    export const validateTier: SelectFieldSingleValidation = async (value, options) => {
    const valid = await select(value, options)
    if (valid !== true) return valid

* if (value !== 'gold' || options.previousValue === 'gold') return true

- if ((value !== 'gold' && value !== 'platinum') || options.previousValue === value) return true

  const { req, id } = options

- const others = id == null ? [] : [{ id: { not_equals: id } }]
- const limits = await tierLimits(req.payload, req)
-
- if (value === 'platinum') {
- const { totalDocs } = await req.payload.count({
-      collection: 'businesses',
-      where: { and: [{ tier: { equals: 'platinum' } }, ...others] },
-      overrideAccess: true,
-      req,
- })
- return platinumPlaceCheck(totalDocs, limits.maxPlatinum)
- }
-
- const category = (options.data as { category?: unknown } | undefined)?.category
- if (typeof category !== 'string' || !category) return true
  const { totalDocs } = await req.payload.count({
  collection: 'businesses',

* where: {
*      and: [{ tier: { equals: 'gold' } }, ...(id == null ? [] : [{ id: { not_equals: id } }])],
* },

- where: { and: [{ tier: { equals: 'gold' } }, { category: { equals: category } }, ...others] },
  overrideAccess: true,
  req,
  })

*
* return goldPlaceCheck(totalDocs, await goldPlaces(req.payload, req))

- return goldPlaceCheck(totalDocs, limits.maxGoldPerCategory)
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

-      'Bronze: the website only, with no QR code. Silver: a magazine page and its QR code, with the website included. Gold: silver, plus first place in every list and a place on the home page, whose number of places is set in Settings, Commission and tiers. Every silver listing comes before every bronze one.',

*      'Bronze: the website only, with no QR code. Silver: a magazine page and its QR code, with the website included. Gold: silver, plus first place in its category, limited per category in Settings, Tiers. Platinum: gold, plus a place on the home page, limited overall in Settings, Tiers. Every silver listing comes before every bronze one.',
  },
  }
  diff --git a/apps/web/src/globals/Settings.test.ts b/apps/web/src/globals/Settings.test.ts
  index 01995f46..26979d5e 100644
  --- a/apps/web/src/globals/Settings.test.ts
  +++ b/apps/web/src/globals/Settings.test.ts
  @@ -1,30 +1,59 @@
  import { describe, expect, it } from 'vitest'
  -import { HOME_PAGE_PLACES } from '@vardenia/core'
  -import { placesFloorCheck } from './Settings'
  -import { placesOrDefault } from '../lib/gold-places'
  +import { DEFAULT_MAX_GOLD_PER_CATEGORY, DEFAULT_MAX_PLATINUM } from '@vardenia/core'
  +import { goldFloorCheck, highestPerCategory, platinumFloorCheck } from './Settings'
  +import { limitOrDefault } from '../lib/tier-limits'

/**

- - The number of gold places, which an admin sets: how many the home page band
- - shows, and so how many gold listings can be sold.

* - The two numbers an admin sets: gold per category, and platinum overall (the
* - home page band).
    */
    -describe('gold places', () => {

- it('uses the default while the setting is empty or unusable', () => {
  +describe('tier limits', () => {

* it('use the default while the setting is empty or unusable', () => {
  for (const value of [null, undefined, 0, -2, 2.5, '8']) {

-      expect(placesOrDefault(value), String(value)).toBe(HOME_PAGE_PLACES)

*      expect(limitOrDefault(value, DEFAULT_MAX_PLATINUM), String(value)).toBe(DEFAULT_MAX_PLATINUM)
  }

- expect(placesOrDefault(10)).toBe(10)

* expect(limitOrDefault(10, DEFAULT_MAX_GOLD_PER_CATEGORY)).toBe(10)
  })
  +})

- it('can be raised, or lowered down to the gold listings already sold', () => {
- expect(placesFloorCheck(10, 6)).toBe(true)
- expect(placesFloorCheck(4, 4)).toBe(true)
  +describe('lowering the platinum limit', () => {

* it('can be raised, or lowered down to the platinum listings already sold', () => {
* expect(platinumFloorCheck(10, 6)).toBe(true)
* expect(platinumFloorCheck(4, 4)).toBe(true)
  })

- /** Lower than that, and some paid gold listings would fall off the home page. */
- it('cannot go below the gold listings there are, and says how to get there', () => {
- const refusal = placesFloorCheck(4, 6)

* it('cannot go below the platinum listings there are, and says how to get there', () => {
* const refusal = platinumFloorCheck(4, 6)
  expect(refusal).not.toBe(true)

- expect(refusal).toContain('6 gold listings')
- expect(refusal).toContain('Move 2 of them to silver')

* expect(refusal).toContain('6 platinum listings')
* expect(refusal).toContain('Move 2 of them to gold')
* })
  +})
*

+describe('lowering the gold limit per category', () => {

- it('can be lowered down to the fullest category', () => {
- expect(goldFloorCheck(5, { category: 'hospitality', count: 5 })).toBe(true)
- expect(goldFloorCheck(5, null)).toBe(true)
- })
-
- it('cannot go below the fullest category, naming it', () => {
- const refusal = goldFloorCheck(2, { category: 'hospitality', count: 5 })
- expect(refusal).not.toBe(true)
- expect(refusal).toContain('hospitality')
- expect(refusal).toContain('5 gold listings')
- expect(refusal).toContain('Move 3 of them to silver')
- })
-
- it('finds the fullest category from a list of gold listings', () => {
- expect(highestPerCategory([])).toBeNull()
- expect(
-      highestPerCategory([
-        { category: 'tourism' },
-        { category: 'hospitality' },
-        { category: 'hospitality' },
-        { category: 'tourism' },
-        { category: 'hospitality' },
-      ]),
- ).toEqual({ category: 'hospitality', count: 3 })
  })
  })
  diff --git a/apps/web/src/globals/Settings.ts b/apps/web/src/globals/Settings.ts
  index 56433b39..3c3b7dbd 100644
  --- a/apps/web/src/globals/Settings.ts
  +++ b/apps/web/src/globals/Settings.ts
  @@ -1,64 +1,105 @@
  import type { GlobalConfig, NumberFieldSingleValidation } from 'payload'
  import { number } from 'payload/shared'
  -import { HOME_PAGE_PLACES } from '@vardenia/core'
  +import { DEFAULT_MAX_GOLD_PER_CATEGORY, DEFAULT_MAX_PLATINUM } from '@vardenia/core'
  import { isAdmin, isStaff } from '../access/index'
  import { clearListingsCache } from '../hooks/revalidateListings'
  import { HIDEABLE_LABELS, HIDEABLE_PAGES } from '../lib/hideable-pages'

/**

- Settings, in the admin: every number the team sets for the business, on one
- page, in three sections.
-
- - Commission: the default rate venues pay on what their guests spent, and
- the rate for reading a receipt in pounds as dollars (core/booking-fees).

* - - Tiers: how many gold listings the home page shows, and so how many can be
* - sold (core/tiers).

- - - Tiers: how many gold listings each category can hold, and how many platinum
- - listings the home page shows, and so how many can be sold (core/tiers).
  - - Pages: standing pages hidden from the site while not ready (lib/hidden-pages).
  - - Accounts: a switch that pauses new customer sign-ups (lib/signups).
  -
  - These were two pages of one or two boxes each, one of them called
  - "Commissions" beside the billing screen of the same name, so the sidebar had
  - two "Commissions" that did different things. They are one page now, named
  - for what it holds, and the billing screen is "Monthly billing".
  -
  - Staff can read it, because the statements they draw up use it; only an
  - admin changes it, as with every other commercial setting.
    */

-/** The most the home page band can sensibly hold: two rows of a wide screen, many swipes on a phone. _/
-export const MAX_GOLD_PLACES = 24
+/_* The most a band or a category's top can sensibly hold: two rows of a wide screen, many swipes on a phone. */
+export const MAX_TIER_PLACES = 24

/**

- - A number of places that every gold listing already sold still fits in.

* - A platinum limit that every platinum listing already sold still fits in.
  -

- - Lowering it below the gold listings there are would leave some of them paid
- - for and off the home page, cut by name. So it is refused, with the way out.
- - Separate from the validator so the rule can be tested without a database.

* - Lowering it below the platinum listings there are would leave some of them
* - paid for and off the home page, cut by name. So it is refused, with the way
* - out. Separate from the validator so the rule can be tested without a database.
    */
    -export function placesFloorCheck(places: number, goldListings: number): string | true {

- if (places >= goldListings) return true
- return `There are ${goldListings} gold listings, so the home page needs at least ${goldListings} places. Move ${goldListings - places} of them to silver first.`
  +export function platinumFloorCheck(places: number, platinumListings: number): string | true {

* if (places >= platinumListings) return true
* return `There are ${platinumListings} platinum listings, so the home page needs at least ${platinumListings} places. Move ${platinumListings - places} of them to gold first.`
  }

-const validatePlaces: NumberFieldSingleValidation = async (value, options) => {
+/** The category holding the most gold listings, and how many, or null when there are none. */
+export function highestPerCategory(

- goldListings: { category?: unknown }[],
  +): { category: string; count: number } | null {
- const counts = new Map<string, number>()
- for (const { category } of goldListings) {
- if (typeof category !== 'string') continue
- counts.set(category, (counts.get(category) ?? 0) + 1)
- }
- let top: { category: string; count: number } | null = null
- for (const [category, count] of counts) {
- if (!top || count > top.count) top = { category, count }
- }
- return top
  +}
-

+/** A gold limit that the fullest category already fits in. Refused otherwise, as for platinum. */
+export function goldFloorCheck(

- places: number,
- fullest: { category: string; count: number } | null,
  +): string | true {
- if (!fullest || places >= fullest.count) return true
- return `The ${fullest.category} category has ${fullest.count} gold listings, so each category needs at least ${fullest.count} places. Move ${fullest.count - places} of them to silver first.`
  +}
-

+const validateMaxPlatinum: NumberFieldSingleValidation = async (value, options) => {
const valid = await number(value, options)
if (valid !== true) return valid
if (value === null || value === undefined) return true
const { totalDocs } = await options.req.payload.count({
collection: 'businesses',

- // Drafts count: a gold draft has been sold its place, as in fields/tier.

* // Drafts count: a platinum draft has been sold its place, as in fields/tier.
* where: { tier: { equals: 'platinum' } },
* overrideAccess: true,
* req: options.req,
* })
* return platinumFloorCheck(value, totalDocs)
  +}
*

+const validateMaxGold: NumberFieldSingleValidation = async (value, options) => {

- const valid = await number(value, options)
- if (valid !== true) return valid
- if (value === null || value === undefined) return true
- const { docs } = await options.req.payload.find({
- collection: 'businesses',
  where: { tier: { equals: 'gold' } },
- select: { category: true },
- depth: 0,
- pagination: false,
  overrideAccess: true,
  req: options.req,
  })

* return placesFloorCheck(value, totalDocs)

- return goldFloorCheck(value, highestPerCategory(docs))
  }

/** Whether the list of hidden pages is different after a save, in any order. */
export function hiddenPagesChanged(before: unknown, after: unknown): boolean {
const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []).sort().join(',')
return list(before) !== list(after)
}

/**

- Makes a change to the hidden pages show on the next view: drops the cached
  @@ -80,21 +121,21 @@ async function showHiddenPages() {
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

* // The gold places decide the home page band, which is cached with the

- // The platinum places decide the home page band, which is cached with the
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
  @@ -134,34 +175,47 @@ export const Settings: GlobalConfig = {
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

*            'Bronze is the website only, silver adds a page in the magazine, and gold adds first place in every list and a place in the band at the top of the home page. Every silver listing comes before every bronze one. A listing tier is set on its Commercial tab.',

-            'Bronze is the website only, silver adds a page in the magazine, gold adds first place in its category, and platinum adds a place in the band at the top of the home page. Every silver listing comes before every bronze one. A listing tier is set on its Commercial tab.',
           fields: [
             {

*              name: 'goldPlaces',
*              label: 'Gold places on the home page',

-              name: 'maxGoldPerCategory',
-              label: 'Gold listings per category',
-              type: 'number',
-              min: 1,
-              max: MAX_TIER_PLACES,
-              admin: {
-                step: 1,
-                placeholder: String(DEFAULT_MAX_GOLD_PER_CATEGORY),
-                description: `How many gold listings each category can hold at the top, and so how many can be sold per category. A listing cannot be moved to gold once its category is full, and the number cannot go below the gold listings in the fullest category. Platinum listings do not count. Empty: ${DEFAULT_MAX_GOLD_PER_CATEGORY}.`,
-              },
-              validate: validateMaxGold,
-            },
-            {
-              name: 'maxPlatinum',
-              label: 'Platinum listings on the home page',
               type: 'number',
               min: 1,

*              max: MAX_GOLD_PLACES,

-              max: MAX_TIER_PLACES,
               admin: {
                 step: 1,

*                placeholder: String(HOME_PAGE_PLACES),
*                description: `How many gold listings the home page shows, and so how many can be sold. A listing cannot be moved to gold once they are all taken, and the number cannot go below the gold listings there are. Empty: ${HOME_PAGE_PLACES}.`,

-                placeholder: String(DEFAULT_MAX_PLATINUM),
-                description: `How many platinum listings the home page shows, and so how many can be sold in all. A listing cannot be moved to platinum once they are all taken, and the number cannot go below the platinum listings there are. Empty: ${DEFAULT_MAX_PLATINUM}.`,
               },

*              validate: validatePlaces,

-              validate: validateMaxPlatinum,
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

diff --git a/apps/web/src/import/photo-import.test.ts b/apps/web/src/import/photo-import.test.ts
index 979ed428..a3e2e3ca 100644
--- a/apps/web/src/import/photo-import.test.ts
+++ b/apps/web/src/import/photo-import.test.ts
@@ -143,25 +143,25 @@ describe('how many gallery photographs a tier displays', () => { * reads it, so the number uploaded and the number shown cannot drift apart - * uploading an image nobody will ever see costs an encode into six sizes and * a place in the bucket.
_/
/_* * Every tier is paid since the website-only tier was added, and the website * listing is the same on all three, so the allowance is too. What separates * the tiers is print, not the number of photographs.
*/
it('is the same fifteen on every tier', () => {

- const limits = (['bronze', 'silver', 'gold'] as const).map((tier) =>

* const limits = (['bronze', 'silver', 'gold', 'platinum'] as const).map((tier) =>
  can(tierOf(tier), 'galleryLimit'),
  )

- expect(limits).toEqual([15, 15, 15])

* expect(limits).toEqual([15, 15, 15, 15])
  })

/** * `listed` and `partner` were retired when four tiers became two. Rows still * carrying them read as the lowest tier.
*/
it('gives a retired tier the allowance of the lowest tier', () => {
for (const retired of ['listed', 'partner']) {
expect(can(tierOf(retired), 'galleryLimit')).toBe(can('bronze', 'galleryLimit'))
}
diff --git a/apps/web/src/lib/gold-places.ts b/apps/web/src/lib/gold-places.ts
deleted file mode 100644
index 9e5af7b6..00000000
--- a/apps/web/src/lib/gold-places.ts
+++ /dev/null
@@ -1,24 +0,0 @@
-import type { Payload, PayloadRequest } from 'payload'
-import { HOME_PAGE_PLACES } from '@vardenia/core'
-

-/**

- - How many gold listings there can be: the number on the admin's Settings page
- - (globals/Settings, Tiers section), or HOME_PAGE_PLACES while it is empty.
- -
- - Read with access overridden, because it decides what anonymous visitors see
- - on the home page. Never throws: a setting that cannot be read falls back to
- - the default rather than taking the home page down with it.
- */
  -export async function goldPlaces(payload: Payload, req?: PayloadRequest): Promise<number> {
- const settings = (await payload
- .findGlobal({ slug: 'settings', depth: 0, overrideAccess: true, ...(req ? { req } : {}) })
- .catch(() => null)) as { goldPlaces?: number | null } | null
- return placesOrDefault(settings?.goldPlaces)
  -}
-

-/** A usable number of places, or the default. */
-export function placesOrDefault(value: unknown): number {

- return typeof value === 'number' && Number.isInteger(value) && value > 0
- ? value
- : HOME_PAGE_PLACES
  -}
  diff --git a/apps/web/src/lib/listings.ts b/apps/web/src/lib/listings.ts
  index 943a2dd5..cd81d2e5 100644
  --- a/apps/web/src/lib/listings.ts
  +++ b/apps/web/src/lib/listings.ts
  @@ -1,16 +1,16 @@
  import { cache } from 'react'
  import { unstable_cache } from 'next/cache'
  import { getPayload, type Where } from 'payload'
  import { dataLocale, type Locale } from '@vardenia/i18n'
  import config from '../payload.config'
  -import { goldPlaces } from './gold-places'
  +import { HOME_PAGE_TIERS, tierLimits } from './tier-limits'
  import type { Business } from '../payload-types'
  import { PUBLISHED_SQL } from '../access'
  import { rawDb } from './db'
  import { FIND_EVERY_CEILING, findByIdsInOrder, findEvery } from './find-every'
  import { isOpenNow, type OpeningHour } from './hours'
  import { reportError } from './report'
  import { rankNearby, type NearbyPick, type Placed } from './nearby'

/**

- Read side for the public directory.
  @@ -720,56 +720,57 @@ async function countByPlace(
  )()

// `null` in the cache, because it serialises; `undefined` out, because that
// is what ListingFilters reads as "not counted" and renders as no number.
return counts ?? undefined
}

/**

- The listings a venue has paid to have shown.
-

* - This is the visible half of what the gold tier buys - the home page draws a
* - band of these above everything else. The other half needs no query at all:
* - every listing grid sorts on `-tier` first, so a gold listing rises to the top
* - of its section without anything here. Gold includes the magazine page, so

- - This is the visible half of what the platinum tier buys - the home page draws
- - a band of these above everything else. The other half needs no query at all:
- - every listing grid sorts on `-tier` first, so a platinum listing, then a gold
- - one, rises to the top of its section without anything here. Platinum includes
- - the magazine page, so
  - the band only ever holds magazine listings.
  -
  - # Why it is its own query rather than a filter on the homepage grid
  -
  - The band has to be able to disappear. A "Featured" heading over an empty row
  - advertises that nobody has bought anything, and for most of the first year
  - there will be nothing in it - so the page asks for these separately and drops
  - the whole section when the answer is empty, the way the magazine band already
  - does. Folding it into the main grid would mean either showing free listings
  - under a paid heading, or a heading with nothing beneath it.
    */
    export async function findFeaturedListings({
    locale,
    }: {
    locale: Locale
    }): Promise<ListingSummary[]> {
    const run = async (): Promise<ListingSummary[]> => {
    const payload = await client()
    // As many places as the admin's Tiers page sets. Saving that page clears
    // this cache (globals/Settings), so a new number shows straight away.

* const limit = await goldPlaces(payload)

- const { maxPlatinum: limit } = await tierLimits(payload)

  const result = await payload.find({
  collection: 'businesses',

*      where: { tier: { equals: 'gold' } },

-      where: { tier: { in: HOME_PAGE_TIERS } },
       locale: dataLocale(locale),
       depth: 1,
       limit,
       pagination: false,
       // Drafts are excluded by the collection's own access rule, not here.
       overrideAccess: false,

*      // All gold, so this orders the band by name.

-      // All platinum, so this orders the band by name.
       sort: ['name'],

  })

  // `pagination: false` returns every match whatever the limit, so cut it
  // here: if the places were lowered, the band still shows only that many.
  return (result.docs as ListingSummary[]).slice(0, limit)
  }

  return unstable_cache(run, ['featured-listings', locale], {
  revalidate: LISTINGS_TTL,
  diff --git a/apps/web/src/lib/media.test.ts b/apps/web/src/lib/media.test.ts
  index c1ac0f8c..0c5d9b7a 100644
  --- a/apps/web/src/lib/media.test.ts
  +++ b/apps/web/src/lib/media.test.ts
  @@ -73,21 +73,21 @@ describe('resolveGallery', () => {
  expect(resolveGallery(undefined)).toEqual([])
  expect(resolveGallery(null)).toEqual([])
  })

  describe('tier limits', () => {
  /** * Gallery size comes from TIER_CAPABILITIES. Before that was enforced, a * listing displayed every image uploaded to it, 40 in one case.
  */
  it('caps every tier at its allowance', () => {

*      for (const t of ['bronze', 'silver', 'gold'] as const) {

-      for (const t of ['bronze', 'silver', 'gold', 'platinum'] as const) {
         expect(resolveGallery(gallery(50), can(t, 'galleryLimit')), t).toHaveLength(15)
       }

  })

  it('does not pad when a listing has fewer images than its allowance', () => {
  expect(resolveGallery(gallery(3), can('silver', 'galleryLimit'))).toHaveLength(3)
  })

  it('keeps the first images, so ordering in the admin decides what shows', () => {
  const shown = resolveGallery(gallery(10), 2)
  @@ -95,33 +95,33 @@ describe('resolveGallery', () => {
  })

  it('handles a zero limit without returning everything', () => {
  expect(resolveGallery(gallery(5), 0)).toHaveLength(0)
  })
  })
  })

describe('tierOf', () => {
it('passes through the real tiers', () => {

- for (const t of ['bronze', 'silver', 'gold'] as const) {

* for (const t of ['bronze', 'silver', 'gold', 'platinum'] as const) {
  expect(tierOf(t)).toBe(t)
  }
  })

/** Retired when four tiers became two, and no longer a tier. */
it('does not pass through a retired tier', () => {
for (const t of ['listed', 'partner']) expect(tierOf(t)).toBe('bronze')
})

/** Fails closed: a corrupt tier must not hand out partner privileges. */
it('falls back to the lowest tier for anything unrecognised', () => {

- for (const v of [null, undefined, '', 'platinum', 42, {}]) {

* for (const v of [null, undefined, '', 'diamond', 42, {}]) {
  expect(tierOf(v)).toBe('bronze')
  }
  })
  })

/**

- A small photograph has no card size: Payload skips sizes the original is too
- small for. The 400px thumbnail used to be chosen ahead of the 780px original.
  */
  describe('a photograph smaller than the size asked for', () => {
  diff --git a/apps/web/src/lib/performance-report.ts b/apps/web/src/lib/performance-report.ts
  index e59719b7..14b48a90 100644
  --- a/apps/web/src/lib/performance-report.ts
  +++ b/apps/web/src/lib/performance-report.ts
  @@ -214,22 +214,26 @@ export function suggestionsFor(b: Facts, flags: Flag[]): Suggestion[] {
  `Settle ${b.disputes} disputed visit${b.disputes === 1 ? '' : 's'} (the guest and the venue disagree) from the bookings list.`,
  true,
  )
  }
  if (b.missing.photograph)
  add('Send us your own photographs: the page shows a stand-in picture today.')
  if (b.missing.hours) add('Add your opening hours, so guests know when to come.')
  if (b.missing.description) add('Add a short description of what makes the place worth the trip.')
  if (b.missing.arabicName) add('Give us your name in Arabic, for Arabic readers.')
  if (b.missing.location) add('Send us your exact location, so the map and directions work.')

* if ((flags.includes('low-scans') || flags.includes('looked-not-booked')) && b.tier !== 'gold') {
* add('Offer Gold: first place in every list and a place on the home page.', true)

- if (
- (flags.includes('low-scans') || flags.includes('looked-not-booked')) &&
- b.tier !== 'gold' &&
- b.tier !== 'platinum'
- ) {
- add('Offer Gold: first place in its category.', true)
  }
  return out
  }

const median = (values: number[]): number => {
if (values.length === 0) return 0
const sorted = [...values].sort((a, b) => a - b)
const mid = Math.floor(sorted.length / 2)
return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}
diff --git a/apps/web/src/lib/tier-limits.ts b/apps/web/src/lib/tier-limits.ts
new file mode 100644
index 00000000..6b6c9832
--- /dev/null
+++ b/apps/web/src/lib/tier-limits.ts
@@ -0,0 +1,48 @@
+import type { Payload, PayloadRequest } from 'payload'
+import {

- DEFAULT_MAX_GOLD_PER_CATEGORY,
- DEFAULT_MAX_PLATINUM,
- LISTING_TIERS,
- can,
- type ListingTier,
  +} from '@vardenia/core'
-

+/**

- - The two caps an admin sets on the Settings page (globals/Settings, Tiers
- - section): how many gold listings one category can hold, and how many
- - platinum listings there can be in all (which is how many the home page band
- - shows). They replace the single "gold places" number, which is no longer read.
- */
  +export interface TierLimits {
- maxGoldPerCategory: number
- maxPlatinum: number
  +}
-

+/**

- - The tiers the home page band draws from: every tier whose capabilities say
- - `homePage`. Declared in packages/core/src/tiers, read here, never hardcoded.
- */
  +export const HOME_PAGE_TIERS: ListingTier[] = LISTING_TIERS.filter((tier) => can(tier, 'homePage'))
-

+/**

- - Read with access overridden, because the platinum number decides what
- - anonymous visitors see on the home page. Never throws: a setting that cannot
- - be read falls back to the defaults rather than taking the home page down.
- */
  +export async function tierLimits(payload: Payload, req?: PayloadRequest): Promise<TierLimits> {
- const settings = (await payload
- .findGlobal({ slug: 'settings', depth: 0, overrideAccess: true, ...(req ? { req } : {}) })
- .catch(() => null)) as {
- maxGoldPerCategory?: number | null
- maxPlatinum?: number | null
- } | null
- return {
- maxGoldPerCategory: limitOrDefault(settings?.maxGoldPerCategory, DEFAULT_MAX_GOLD_PER_CATEGORY),
- maxPlatinum: limitOrDefault(settings?.maxPlatinum, DEFAULT_MAX_PLATINUM),
- }
  +}
-

+/** A usable number of places, or the default. */
+export function limitOrDefault(value: unknown, fallback: number): number {

- return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
  +}
  diff --git a/apps/web/src/payload-types.ts b/apps/web/src/payload-types.ts
  index b7b7d4b6..c8673e5b 100644
  --- a/apps/web/src/payload-types.ts
  +++ b/apps/web/src/payload-types.ts
  @@ -437,23 +437,23 @@ export interface Business {
  docs?: (number | RoomType)[];
  hasNextPage?: boolean;
  totalDocs?: number;
  };
  roomDateList?: {
  docs?: (number | RoomAvailability)[];
  hasNextPage?: boolean;
  totalDocs?: number;
  };
  /**

* - Bronze: the website only, with no QR code. Silver: a magazine page and its QR code, with the website included. Gold: silver, plus first place in every list and a place on the home page, whose number of places is set in Settings, Commission and tiers. Every silver listing comes before every bronze one.

- - Bronze: the website only, with no QR code. Silver: a magazine page and its QR code, with the website included. Gold: silver, plus first place in its category, limited per category in Settings, Tiers. Platinum: gold, plus a place on the home page, limited overall in Settings, Tiers. Every silver listing comes before every bronze one.
    */

* tier: 'bronze' | 'silver' | 'gold';

- tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  /**
  - A percentage of what each guest who came spent, as entered by the venue. Leave the rate empty to use the rate in Settings, Commission and tiers. No-shows and cancellations are never charged.
    _/
    commission?: {
    /_*
    - Only if this venue agreed a different rate. 0 bills nothing.
      _/
      rate?: number | null;
      /_*
    - Launch offer: bookings on or before this day are not billed. Empty when there is none.
      @@ -2364,23 +2364,27 @@ export interface Setting {
      id: number;
      /**
  - What every venue that takes bookings pays, unless its listing has a rate of its own (Commercial tab of the listing). Empty: nobody is billed.
    _/
    defaultRate?: number | null;
    /_*
  - Today's rate, to read a guest's receipt in LBP as dollars. A receipt is converted on the day it arrives, so changing this later does not change visits already received. Empty: receipts in LBP are not used, and the venue's amount is billed instead.
    _/
    poundsPerDollar?: number | null;
    /_*

* - How many gold listings the home page shows, and so how many can be sold. A listing cannot be moved to gold once they are all taken, and the number cannot go below the gold listings there are. Empty: 6.

- - How many gold listings each category can hold at the top, and so how many can be sold per category. A listing cannot be moved to gold once its category is full, and the number cannot go below the gold listings in the fullest category. Platinum listings do not count. Empty: 6.
    */

* goldPlaces?: number | null;

- maxGoldPerCategory?: number | null;
- /**
- - How many platinum listings the home page shows, and so how many can be sold in all. A listing cannot be moved to platinum once they are all taken, and the number cannot go below the platinum listings there are. Empty: 6.
- */
- maxPlatinum?: number | null;
  /**
  - Pick the pages to hide. Remove one from the list to show it again. Takes effect on the next view.
    _/
    hiddenPages?:
    | (
    | 'about'
    | 'contact'
    | 'faq'
    | 'partner-with-us'
    | 'advertise'
    @@ -2409,21 +2413,22 @@ export interface Setting {
    updatedAt?: string | null;
    createdAt?: string | null;
    }
    /_*

* This interface was referenced by `Config`'s JSON-Schema
* via the `definition` "settings_select".
  */
  export interface SettingsSelect<T extends boolean = true> {
  defaultRate?: T;
  poundsPerDollar?: T;

- goldPlaces?: T;

* maxGoldPerCategory?: T;
* maxPlatinum?: T;
  hiddenPages?: T;
  signupsPaused?: T;
  updatedAt?: T;
  createdAt?: T;
  globalType?: T;
  }
  /**

- This interface was referenced by `Config`'s JSON-Schema
- via the `definition` "collections_widget".
  */
  diff --git a/apps/web/src/seed/fixtures.test.ts b/apps/web/src/seed/fixtures.test.ts
  index 77a941de..a4017fe8 100644
  --- a/apps/web/src/seed/fixtures.test.ts
  +++ b/apps/web/src/seed/fixtures.test.ts
  @@ -1,13 +1,14 @@
  import { describe, expect, it } from 'vitest'
  import {

* HOME_PAGE_PLACES,

- DEFAULT_MAX_GOLD_PER_CATEGORY,
- DEFAULT_MAX_PLATINUM,
  GOVERNORATES,
  LISTING_TIERS,
  TAXONOMY,
  isWithinLebanon,
  } from '@vardenia/core'
  import { ARTICLES, BUSINESSES, ISSUES, SCAN_CITIES, SEEDED_SLUGS } from './fixtures'
  import { richText } from './rich-text'

/**

- Seed data rots quietly. A category slug that no longer exists produces a
  @@ -94,27 +95,34 @@ describe('business fixtures', () => {
  for (const hour of b.openingHours) {
  if (hour.closed) continue
  expect(hour.opens, `${b.slug} ${hour.day} has no opening time`).toMatch(/^\d{2}:\d{2}$/)
         expect(hour.closes, `${b.slug} ${hour.day} has no closing time`).toMatch(/^\d{2}:\d{2}$/)
  }
  }
  })

/** * Every tier has an example, so each rung can be seen on a fresh database.

- - And no more gold listings than the home page shows, or the seed would build
- - a state the admin refuses.

* - And no more platinum listings than the home page shows, nor gold ones in a
* - category than it can hold, or the seed would build a state the admin refuses.
    */

- it('has a listing on every tier, and gold within the home page places', () => {

* it('has a listing on every tier, within the platinum and per-category gold caps', () => {
  expect(new Set(BUSINESSES.map((b) => b.tier))).toEqual(new Set(LISTING_TIERS))

- const gold = BUSINESSES.filter((b) => b.tier === 'gold')
- expect(gold.length).toBeLessThanOrEqual(HOME_PAGE_PLACES)

* const platinum = BUSINESSES.filter((b) => b.tier === 'platinum')
* expect(platinum.length).toBeLessThanOrEqual(DEFAULT_MAX_PLATINUM)
* const perCategory = new Map<string, number>()
* for (const b of BUSINESSES.filter((x) => x.tier === 'gold')) {
*      perCategory.set(b.category, (perCategory.get(b.category) ?? 0) + 1)
* }
* for (const count of perCategory.values()) {
*      expect(count).toBeLessThanOrEqual(DEFAULT_MAX_GOLD_PER_CATEGORY)
* }
  })
  })

describe('article fixtures', () => {
it('points every featured business at a real fixture', () => {
const known = new Set(BUSINESSES.map((b) => b.slug))
for (const article of ARTICLES) {
for (const slug of article.featured) {
expect(known.has(slug), `${article.slug} features unknown ${slug}`).toBe(true)
}
diff --git a/apps/web/src/seed/fixtures.ts b/apps/web/src/seed/fixtures.ts
index 0cd33a22..004d5d8a 100644
--- a/apps/web/src/seed/fixtures.ts
+++ b/apps/web/src/seed/fixtures.ts
@@ -73,21 +73,21 @@ export const BUSINESSES: BusinessFixture[] = [
},
category: 'hospitality',
subcategories: ['hotels'],
governorate: 'beirut',
district: 'beirut',
address: {
en: '137 Abdel Wahab El Inglizi Street, Achrafieh',
ar: 'شارع عبد الوهاب الإنكليزي، الأشرفية',
},
location: [35.5199, 33.8886],

- tier: 'gold',

* tier: 'platinum',
  verified: true,
  priceRange: '4',
  amenities: [
  'pool',
  'spa',
  'valet-parking',
  'accessible',
  'alcohol',
  'wifi',
  'air-conditioning',
  diff --git a/docs/superpowers/plans/2026-11-20-core-backend.md b/docs/superpowers/plans/2026-11-20-core-backend.md
  index 74fc2ea5..2c1e6560 100644
  --- a/docs/superpowers/plans/2026-11-20-core-backend.md
  +++ b/docs/superpowers/plans/2026-11-20-core-backend.md
  @@ -1,189 +1,197 @@

# Core Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Complete the backend for restaurants, hotels, guest houses and listing-only services: tiers with caps, public contact details, partner self-editing, public address and map link, hotel option lists and public prices, guest houses sold as a whole property, booking price snapshots, restaurant seating areas, restaurant brands and branches, and review rules.

-**Architecture:** Pure rules go in `packages/core` (tiers, quotes, option lists). Payload collections and hooks in `apps/web/src`. Partners edit their own listings through Payload's normal update, restricted by an allow-list hook (the same pattern as `guardRoomTypeWrite` and `guardClosureWrite`). Public JSON stays under existing route conventions (`/booking/*`, `/place-submissions`), never `/api`.
-

-**Tech Stack:** Next.js 15, Payload 3 (Postgres, Drizzle migrations), zod via `@vardenia/core`, next-intl, Vitest. +**Architecture:** Pure rules go in `packages/core`. Payload collections and hooks in `apps/web/src`. Partners edit their own listings through Payload's normal update, restricted by an allow-list hook (the pattern of `guardRoomTypeWrite` and `guardClosureWrite`). Public JSON stays under existing route conventions, never `/api`.

**Spec:** `docs/superpowers/specs/2026-11-20-core-backend-design.md` (binding; its Rulings section settles ambiguities).

## Global Constraints

- Branch `core-booking`. Do not commit, push, merge or deploy unless the tech lead asks. Every task ends at green tests.
  -- Backend only. Do not restyle pages. Where a public page must keep rendering after a change (for example the tier or the location switch), make the smallest change that keeps it correct; do not redesign it.
  -- Source files are ASCII (Arabic strings only in the i18n JSON). New user-facing strings go in all 10 `packages/i18n/src/messages/*.json` files (real Arabic in ar.json, English text in the others, same as the magazine-places keys).
  +- Backend only. Do not restyle pages; make the smallest change that keeps a public page correct.
  +- Source files are ASCII (Arabic only in the i18n JSON). New user-facing strings go in all 10 `packages/i18n/src/messages/*.json` files (real Arabic in ar.json, English text in the others).
- Staff-only stays staff-only with field-level `access.read`: tier, commission, verified, contract dates, `submission.*`, `importBatch`, `qrCode`, internal notes.
  -- Public reads must never expose staff-only fields. Public JSON routes are rate limited (`withRateLimit`) and send `cache-control: no-store` unless cacheable by design.
  -- Money is USD, stored as numbers with two decimals at most, never negative.
  -- A booking is a half-open interval `[start, end)`; capacity is checked in the database path, not the page. Do not weaken `guardBookingWrite`, `booking-service` or `availability`.
  -- Taxonomy lives in `packages/core/src/taxonomy.ts`. Bookable subcategories are flagged there.
  -- Never run migrations, seed or `pnpm dev` against a database. Task 11 only generates the migration. `pnpm --filter @vardenia/web generate:types` may run against the dev database in `.env` (never `.env.prod`) to refresh `payload-types.ts`; if the database is unreachable, report it instead of hand-editing that file.
  -- Tests: `pnpm --filter @vardenia/web test`, `pnpm --filter @vardenia/core test`, types `pnpm --filter @vardenia/web typecheck`. Write the failing test first.
  -- Existing listings in the databases are fake test data; never write code that depends on them.
  +- Public reads must never expose staff-only fields. Public JSON routes are rate limited (`withRateLimit`) and `no-store` unless cacheable by design.
  +- Money is USD, numbers with at most two decimals, never negative.
  +- A booking is a half-open interval `[start, end)`; capacity is enforced in the database path. Do not weaken `guardBookingWrite`, `booking-service` or `availability`.
  +- Never run migrations, seed or `pnpm dev`. Task 11 only generates the migration. `generate:types` may run against the dev DB in `.env` (never `.env.prod`).
  +- Tests: `pnpm --filter @vardenia/web test`, `pnpm --filter @vardenia/core test`, `pnpm --filter @vardenia/web typecheck`. Failing test first. Known unrelated failure: `ContentPage.test.tsx`.
  +- Existing listings are fake test data; never depend on them.

## Review Focus

-1. A partner can change only allow-listed fields of listings they own; every other field and every other listing is refused server-side, including via a crafted REST body. (Tasks 3, 9)
-2. Public reads of `businesses`, `room-types`, `brands` never leak staff-only fields. (Tasks 1, 2, 5, 6, 9)
-3. Gold and platinum caps cannot be exceeded by two simultaneous saves beyond what the existing tier cap logic already tolerates; lowering a cap below the number sold is refused. (Task 1)
-4. Booking capacity is never weakened: per-area restaurant capacity and whole-property guest house stays still refuse overlaps. (Tasks 6, 8)
-5. Price snapshot on a booking equals what the public quote showed. (Task 7)
+1. A partner can change only allow-listed fields of listings they own, including via a crafted REST body. (Tasks 3, 9)
+2. Public reads never leak staff-only fields. (Tasks 1, 2, 5, 6, 9)
+3. Tier caps: lowering a cap below the number sold is refused. (Task 1)
+4. Booking capacity is never weakened. (Tasks 6, 8)
+5. The price snapshot equals the public quote. (Task 7)

### Task 1: Tiers - platinum, home page, category top, admin caps

**Goal:** Four tiers: bronze (website), silver (+ magazine), gold (+ top of its category), platinum (+ home page). Two admin inputs: maximum gold per category and maximum platinum, both default 6.

**Start from:** `packages/core/src/tiers.ts` (ladder, `HOME_PAGE_PLACES`, capabilities), `apps/web/src/fields/tier.ts`, `apps/web/src/globals/Settings.ts` (Tiers section), `apps/web/src/lib/gold-places.ts`, `apps/web/src/lib/listings.ts` (home band and `-tier` sorts), `ensureQrCode`, `protectPrintedCodes`, `home-listings.ts`, `listing-gaps.ts`, tests mentioning tiers, i18n tier labels.

**Requirements:**

- Add `platinum` as the top rung of `LISTING_TIERS`. Enum order is the sort order: bronze, silver, gold, platinum, so `-tier` puts platinum first. A new rung is declared in its place on the ladder.
- Capabilities (declare once in `tiers.ts`, UI reads them): bronze website only; silver website + magazine (printed QR code as today); gold adds `topOfCategory`; platinum adds `homePage` and keeps `topOfCategory`.
- The home page band shows platinum listings, not gold. Replace the single "home page places" setting by two settings: `maxGoldPerCategory` (default 6) and `maxPlatinum` (default 6), in the Settings global's Tiers section, with a clear admin description. Keep reading the old setting only if a migration-free fallback is needed; do not keep both active.
- Enforce on save (extend the existing cap logic in `Settings`/`gold-places`): refuse making a listing platinum when `maxPlatinum` are already platinum; refuse making it gold when its category already holds `maxGoldPerCategory` gold listings (count non-trashed listings of the same `category`, any status, excluding the listing itself). Platinum does not count against the gold per-category cap. Readable error naming the limit.
- Refuse lowering either setting below the number currently sold (as the admin already does for the old setting).
- Every directory/category/search sort keeps ranking platinum, then gold, then silver, then bronze; the home page band draws from platinum only.
- Existing gold listings stay gold.
- `payload-types` regenerate; tests updated and new tests for: ladder order, capabilities, cap enforcement per category and global, refusal when lowering, home band picks platinum only, sort order.

**Interfaces other tasks rely on:** `LISTING_TIERS` includes `platinum`; `can(tier, 'topOfCategory' | 'homePage')`.

-

### Task 2: Public contact details, no website

**Goal:** Listings have optional public contact details the business manages: phone, WhatsApp, email, and social links. No website field anywhere.

**Start from:** `apps/web/src/collections/Businesses.ts` (the `submission` group has `publicPhone` and `website`), `packages/core/src/place-submission.ts` (+test), `apps/web/src/lib/place-submission.ts`, `components/places/PlaceSubmissionForm.tsx`, `form-model.ts`, `submit-client.ts`, `lib/place-submission-email.ts`, preview templates, i18n `magazinePlaces` keys, `guardSort`.

**Requirements:**

- New group `contact` on `businesses`, publicly readable: `phone`, `whatsapp`, `email`, `instagram`, `facebook`, `tiktok`, `snapchat`, `youtube`, `x`, `linkedin`. All optional. Validation: phone/whatsapp loose international format (digits, spaces, `+`, `-`, parentheses, 6-20 chars); email a valid address; social links must be `https://` URLs on the right host (instagram.com, facebook.com or fb.com, tiktok.com, snapchat.com, youtube.com or youtu.be, x.com or twitter.com, linkedin.com) or a bare handle that the hook turns into the full URL for instagram, tiktok, x, snapchat. Reject any other scheme (`javascript:`, `data:`).
- Remove `website` from the `submission` group, from the submission schema, the form, the route mapping, the emails and the i18n keys. Move `publicPhone` into `contact.phone` (drop it from `submission`). The form keeps one public phone input and gains optional Instagram and Facebook inputs (simple text fields); the route maps them into `contact`.
- Business owners can later edit `contact` (Task 3 adds it to the allow-list; here just make the field public-readable and well validated).
- `guardSort` covers any newly added staff-only paths; contact is public so it is not guarded.
- Tests: schema accepts/rejects, handles normalised to URLs, hostile URLs refused, the created draft stores contact, website no longer accepted (unknown keys stripped), public read returns contact.

*

### Task 3: Partner can edit their own listing

**Goal:** A signed-in partner edits their own listings from the dashboard, only on an allow-list of fields. Partners also upload images and a menu file for their own listings.

**Start from:** `access/index.ts` (`ownedBusinessIds`, `publishedStaffOrOwned`, `isStaffOrOwnerFieldLevel`), `hooks/guardRoomTypeWrite.ts`, `hooks/guardClosureWrite.ts`, `hooks/guardSelfAccountUpdate.ts`, `collections/Media.ts`, `hooks/limitUploadSize.ts`, `hooks/blockMediaInUse.ts`, `hooks/autoTranslateListing.ts`.

**Requirements:**

- `businesses.update` allows staff (as today) and a business-user for the ids in `ownedBusinessIds`, as a query constraint (never a boolean).
- A `beforeValidate`/`beforeOperation` hook `guardPartnerListingWrite` applies only to business-users: any key outside the allow-list is refused with a readable public APIError (400). The allow-list is one exported constant `PARTNER_EDITABLE_FIELDS` in `packages/core` so later tasks append to it. Initial allow-list: `name`, `tagline`, `description`, `heroImage`, `gallery`, `logo`, `menu`, `amenities`, `payments`, `openingHours`, `seasonality`, `address`, `contact`, `tags`. Later tasks add their fields. Never allowed: `_status`, `tier`, `verified`, `slug`, `qrCode`, contract and commission fields, `booking` rules, `issue`, `listingNumber`, `submission`, `importBatch`, `category`, `subcategories`, `governorate`, `district`, `brand`.
- A partner cannot change `_status` (cannot unpublish or publish) or delete a listing (`delete` stays staff-only).
- Media: a business-user may create `media` for the purposes of their listing only: image types and PDF, existing size limits and unguessable filenames, rate limited; the media row records which partner uploaded it. A partner may attach to their listing only media they uploaded (a guard refuses another's media id). Partners cannot read other partners' unattached media. Staff behaviour unchanged. Check how media access and `blockMediaInUse` interact and keep them intact.
- Translation: confirm what `autoTranslateListing` does on a partner edit; it must not run unbounded or cost per keystroke; if it can, apply the same debounce/skip rule the admin uses and state the result in the report.
- Tests: partner edits an allow-listed field on own listing (ok); sends a forbidden key (refused); edits another partner's listing (refused/not found); cannot change status; cannot attach another partner's media; staff unchanged; crafted REST body with nested forbidden keys refused.

*

### Task 4: Address and map link public and editable

**Goal:** The address and a map link are shown publicly. The business enters them in the dashboard.

**Start from:** `lib/location-display.ts` (the `SHOW_LOCATION` switch), `lib/maps-link.ts`, `components/admin/MapsLinkField`, `Businesses.ts` (`address`, `location`, `area`), the listing page's use of `SHOW_LOCATION`.

**Requirements:**

- Turn the location display on (area, address, map links) and keep the code path tidy; remove the hidden-for-now workaround only as far as needed.
- Add public `mapUrl` text field (the pasted Google Maps link). Validate it as an `https://` URL on `google.com/maps`, `maps.google.com`, `goo.gl/maps` or `maps.app.goo.gl`. A hook fills the `location` point from the link when the link carries coordinates (`@lat,lng` or `!3dLAT!4dLNG` or `?q=lat,lng`); short links are stored as is and do not change `location`. Never fetch the network.
- `address` and `location` are public. Add `mapUrl` and `location` to `PARTNER_EDITABLE_FIELDS` (Task 3's constant). Partners can also set `location` directly as a point with latitude and longitude validation.
- Tests: link parsing for each format, hostile or unknown links refused, short link kept without a point, partner can set address, link and point.

*

### Task 5: Hotels - option lists, facilities, public prices

**Goal:** Each room type has Booking.com-style option lists the hotel chooses from; the hotel has facilities and highlights; prices are public.

**Start from:** `collections/RoomTypes.ts` (amenities, views, options with price), `lib/room-display.ts`, `components/rooms/RoomsSection.tsx`, `packages/core/src/attributes.ts`, `canHaveRoomTypes`, `hooks/guardRoomTypeWrite.ts`.

**Requirements:**

- Option lists live in `packages/core` as code with English and Arabic labels, like `AMENITIES`. Keep every slug that exists today.
  - Room options (merge into the existing room amenities/views; do not duplicate): private-kitchenette, private-bathroom, shared-bathroom, bathtub, shower, balcony, terrace, sea-view, mountain-view, city-view, garden-view, pool-view, landmark-view, air-conditioning, heating, flat-screen-tv, free-wifi, minibar, coffee-machine, kettle, refrigerator, microwave, safe, desk, seating-area, dining-area, sofa, wardrobe, hairdryer, free-toiletries, bathrobes, slippers, iron, soundproofing, fireplace, extra-bed-available, crib-available. Size in m2 stays its own number field.
  - Hotel facilities (full list), `popularFacilities` (subset of the full list, max 8) and `propertyHighlights` (max 6) as three public `select hasMany` fields on `businesses`, valid only when `canHaveRoomTypes`: facilities include free-wifi, parking-free, parking-paid, airport-shuttle, family-rooms, non-smoking-rooms, restaurant, bar, 24h-front-desk, room-service, fitness-centre, spa-wellness, outdoor-pool, indoor-pool, pets-allowed, accessible, breakfast, terrace, garden, beachfront, ev-charging, laundry, business-centre, meeting-rooms, kids-club, babysitting, currency-exchange, luggage-storage, concierge, bbq, elevator, heating, air-conditioning-public. Highlights: parking, wellness, breakfast, pool, beachfront, mountain-view, city-centre, family-friendly, romantic, business-friendly, pet-friendly, quiet-location.
  - Note in the code comment and the report that Booking.com's page could not be read, so these lists follow its standard facility names and need the lead's confirmation.
- Prices: the room option `price` (USD per night) becomes publicly readable (it is staff and owner only today). Add a pure helper in core, `fromPrice(options)`, returning the lowest active price. Validation: price optional but if set must be a number >= 0 with at most 2 decimals.
- The hotel and its room types are editable by the owner: add `facilities`, `popularFacilities`, `propertyHighlights` to `PARTNER_EDITABLE_FIELDS`; confirm `room-types` write access already lets the owner choose the new options and set prices; if not, fix it.
- A restaurant or any non-hotel cannot save these facility fields (validation message).
- Tests: lists have unique slugs and Arabic labels; old slugs preserved; public read of room-types returns price; popular must be subset and max 8; owner can write; other kinds refused.

*

### Task 6: Guest houses sold as a whole property

**Goal:** A guest house is booked as a whole property for nights, with a nightly price, an included-guest count, an extra-guest fee, optional packages and optional features, all managed by the owner.

**Start from:** `packages/core/src/taxonomy.ts` (`ROOM_TYPE_SUBCATEGORIES`, `canHaveRoomTypes`), `fields/bookingRules.ts`, `collections/RoomTypes.ts` filterOptions, `lib/booking-service.ts`, `lib/availability.ts`, `app/booking/availability`, `app/booking/request`, `packages/core/src/booking-request.ts`.

**Requirements:**

- `getaways` stops being a room-type kind: `ROOM_TYPE_SUBCATEGORIES` becomes hotels only. Adjust `RoomTypes` filterOptions and checks; existing data is fake so no data migration is needed.
- New public group `stay` on `businesses`, only valid when the listing has the `getaways` subcategory (validation message otherwise): `nightlyPrice` (USD), `includedGuests` (integer >= 1), `maxGuests` (integer >= includedGuests, the hard cap, optional), `extraGuestFee` (USD per extra guest per night, default 0), `childrenCountAsGuests` (boolean, default true), `minNights` (default 1), and `packages`: array of up to 10 rows `{ label (localized), description (localized), price (USD), unit: 'per-night' | 'per-stay' | 'per-person-per-night', active }` with stable row ids.
- New public group `features` (getaways only): checkboxes `musicAllowed`, `eventsHosted`, `partiesAllowed`, `gardenAccess`, `barbecue`, `pool`, all optional.
- Pure quote function in `packages/core` (`quoteStay`): inputs nights, adults, children, the `stay` config and an optional package id; output total, currency, per-line breakdown (nightly or package, extra guests), or a refusal reason (`below-min-nights`, `above-max-guests`, `unknown-package`, `inactive-package`). Rules: guests counted = adults (+ children when `childrenCountAsGuests`); extra = max(0, guests - includedGuests); a package replaces the nightly price for its unit; extra-guest fee applies per extra guest per night on top. Fully unit-tested, including rounding to two decimals.
- Booking rules for a guest house: whole property means capacity 1 (one stay at a time); document in the field description and make the booking service reject a stay shorter than `minNights` and more guests than `maxGuests`. Do not weaken the overlap check.
- `stay` and `features` go on `PARTNER_EDITABLE_FIELDS`. Restaurants and hotels cannot save them.
- Tests: quote table-driven; validation of getaways-only; partner can edit; a second overlapping stay is refused; room types can no longer be created for a getaway.

*

### Task 7: Price snapshot on bookings, hotels and guest houses

**Goal:** A booking stores the price the customer was quoted, and the availability endpoint returns the quote before booking.

**Start from:** `collections/Bookings.ts`, `lib/booking-service.ts`, `lib/room-booking.ts`, `lib/room-availability.ts`, `app/booking/availability`, `app/booking/rooms`, `app/booking/request`, `packages/core/src/booking-request.ts`, `quoteStay` (Task 6), `fromPrice` (Task 5).

**Requirements:**

- New group `price` on `bookings` (readable by staff, the owning business and the booking's customer; written only by the booking service): `total`, `currency` ('USD'), `lines` array `{ label, amount }`, `nights`, `quotedAt`. Empty for restaurants and for businesses without prices.
- Hotel: total = sum over room lines of nights x option price x count, using the room option price at booking time; refuse the request when a chosen option has no price only if the hotel's rooms are priced elsewhere (decide and note: unpriced options simply produce no snapshot, never a zero total).
- Guest house: the `quoteStay` result; the request may carry an optional `packageId`.
- `/booking/availability` and `/booking/rooms` include the quote (or the refusal reason) in the response; `/booking/request` recomputes the quote on the server and stores it; a quote sent by the client is never trusted.
- Editing a business price later never changes existing bookings.
- Restaurants never get a price group.
- Tests: hotel totals (multi-room, multi-night), guest house with and without package and extra guests, snapshot unchanged after price edit, forged client price ignored, customer reads own snapshot only.

*

### Task 8: Restaurant seating areas

**Goal:** A restaurant defines seating areas (smoking or non-smoking, indoor or outdoor), each with its own capacity. The customer picks an area; capacity is checked per area.

**Start from:** `lib/availability.ts` (capacity counts overlapping bookings; "a single number"), `fields/bookingRules.ts`, `collections/Bookings.ts`, `lib/booking-service.ts`, `app/booking/request`, `packages/core/src/booking-request.ts`, `guardBookingWrite`, the DB-level capacity path in `booking-service`.

**Requirements:**

- New public group on `businesses` valid only for restaurants: `seatingAreas`, an array of up to 8 rows `{ setting: 'indoor' | 'outdoor', smoking: boolean, tables: integer >= 1 (how many bookings may overlap in this area), label (optional, localized) }`. The area key is `indoor`, `indoor-smoking`, `outdoor`, `outdoor-smoking` ( unique per listing; duplicates refused ). Add to `PARTNER_EDITABLE_FIELDS`.
- `bookings` gets an optional `area` field (the key). The booking request accepts `area`. When the listing defines areas, `area` is required and must be one of them; capacity for that booking is the area's `tables`, counted only against bookings with the same area. A listing without areas behaves exactly as today. Bookings without an area on a listing that later gains areas are ignored by per-area counts (note this).
- Optional stay length: confirm how the customer chooses duration today (booking rules min/max duration); if the request cannot carry a duration, accept an optional `durationMinutes` within the rules' min and max and default to the rules' min; otherwise leave as is and say so in the report.
- Smoking and outdoor-seating amenities stay as they are.
- `/booking/availability` returns availability per area for a restaurant that has areas.
- Tests: two areas with different capacity fill independently; area required when defined; unknown area refused; legacy listing unchanged; overlap race still refused; owner can edit areas; non-restaurant cannot save them.

*

### Task 9: Restaurant brands and branches

**Goal:** A restaurant brand groups branches. Each branch is a listing with its own location, hours and reservations. A partner manages all their branches and can add a branch. The customer opens the brand, picks a branch, and books on it.

**Start from:** `collections/BusinessUsers.ts` (`businesses` is staff-only), `lib/session.ts` (`ownerListings`), `hooks/linkPartnerOnPublish.ts`, `lib/place-submission.ts` (draft creation pattern, slug clash retry), `app/place-submissions/route.ts` (public door pattern), `lib/known-paths.ts` and `proxy.ts` (path registration), `fields/bookingRules.ts`, `lib/rate-limit.ts`, `lib/place-submission-email.ts`.

**Requirements:**

- New collection `brands` (`brands`): `name` (localized), `slug` (unique, permanent once set, generated like listing slugs), `logo`, `description` (localized), `published` (read-only mirror: a brand is public when at least one of its listings is published). Public read of a brand is allowed only when it has a published branch; staff manage all. Brand create/update is staff or the system; a partner cannot edit it directly (the branch endpoint creates it).
- `businesses.brand` relationship (optional, restaurants only; validation message otherwise). Staff can set it; partners cannot (not on the allow-list).
- Public lib and route `GET /brands/[slug]` (register the path): brand name, logo, description, and its published branches (id, name, slug, address, governorate, district, map link, location, opening hours, whether booking is enabled), nothing staff-only. Rate limited.
- Partner branch endpoint `POST /partner/branches`: a signed-in partner who owns a restaurant listing (the source) sends the new branch's name suffix or name, governorate, district, address, map link or point, opening hours and contact. The server creates the brand if the source has none (named after the source, source linked) and creates a new draft listing copied from the source (category, subcategories, tagline, description, hero, gallery, logo, amenities, payments, menu, contact, seatingAreas), with `booking.enabled` false, tier default, no contract, `submission.status` pending with the partner's email, linked to the same brand and appended to the partner's `businesses` through the system (overrideAccess). Limits: at most 20 branches per brand, 5 new branches per partner per day, rate limited, slug clash retry as in the submission route, no QR code minted on draft, team notified by email. Staff publish after setting tier and contract (the existing publish hook links the partner idempotently).
- Partners see all their listings already through `ownerListings`; add a lib helper that groups them by brand for the dashboard.
- Booking stays per listing; nothing in the booking path changes.
- Tests: public brand read hides drafts and staff-only fields; a partner cannot create a branch from a listing they do not own or a non-restaurant; limits; copied fields are an allow-list; brand auto-created once; staff publish links without duplicates.

*

### Task 10: Review rules

**Goal:** Only bookable services can be reviewed, and only by a customer whose booking the business marked completed.

**Start from:** `collections/Reviews.ts`, `app/reviews/route.ts`, `lib/review-service.ts`, `lib/reviews.ts`, `packages/core/src/booking.ts` (`BOOKING_TRANSITIONS`, `ACTOR_TARGETS`), `hooks/guardBookingWrite.ts`, `hooks/notifyBookingStatus.ts`.

**Requirements:**

- Verify and cover with tests the whole chain: customer books; the business (owner) marks the booking `completed` (only after its start time, only on their own listing); only then the review route accepts a review from that same customer for that listing, once per booking; a customer cannot complete their own booking; a no-show or cancelled booking cannot be reviewed.
- Refuse reviews for a listing that does not take bookings (`booking.enabled` false or non-bookable subcategory) with a clear reason code even if a booking row somehow exists.
- If the invitation to review is already sent when the booking becomes completed, keep it; if not, add the smallest hook so the customer is told they can now review (reuse `notifyBookingStatus` patterns and the email palette; strings in all 10 locales).
- Fix any gap found; report precisely what was already correct.
- Tests per rule above.

*

### Task 11: Migration, types, docs

**Goal:** One migration for all schema changes, regenerated types, docs updated.

**Requirements:**

- Generate one Drizzle migration with additions only for new tables, columns and the `platinum` enum value (`ALTER TYPE ... ADD VALUE` placed correctly; enum order as declared in Task 1), plus drops only for the columns removed from the `submission` group in Task 2 (`submission_website`, `submission_public_phone`) with a `down` that is safe (IF EXISTS). Review the SQL by hand for: no default that would change existing rows (the lesson from `submission_status`), RLS enabled on new tables like `listing_ranges`, indexes, unique slug on brands.
- Do not apply the migration anywhere. Regenerate `payload-types.ts` and the admin import map if components were added.
- Update `docs/ARCHITECTURE.md`: collections table (`brands`), partner editing section, tiers section (four tiers and two caps), public routes (`/brands/[slug]`, `/partner/branches`), the booking price snapshot, restaurant areas and guest house whole-property model.
- Add `.env.example` entries only if new env vars were introduced.
- Run the full web and core test suites and typecheck; report any failure that is not caused by this work (known: `ContentPage.test.tsx` fails on an unmocked `next/font/google` in a frontend component).

*

diff --git a/packages/core/src/tiers.test.ts b/packages/core/src/tiers.test.ts
index c5a28d6e..b7d25421 100644
--- a/packages/core/src/tiers.test.ts
+++ b/packages/core/src/tiers.test.ts
@@ -1,12 +1,19 @@
import { describe, expect, it } from 'vitest'
-import { HOME_PAGE_PLACES, LISTING_TIERS, TIER_CAPABILITIES, can, tierOf } from './tiers'
+import {

- DEFAULT_MAX_GOLD_PER_CATEGORY,
- DEFAULT_MAX_PLATINUM,
- LISTING_TIERS,
- TIER_CAPABILITIES,
- can,
- tierOf,
  +} from './tiers'

/**

- The commercial model, asserted rather than assumed.
-
- This file is read by sales material as well as by the site, so a capability
- set to true here is a promise somebody will make to a business. That is a
- different kind of mistake from a rendering bug: it is discovered by a customer
- asking for something we cannot do.
  */

@@ -43,20 +50,21 @@ describe('the ladder holds its shape', () => {
below.galleryLimit,
)

       for (const flag of [
         'editorialFeature',
         'qrCode',
         'analyticsAccess',
         'printInclusion',
         'pushCampaigns',
         'homePage',

-        'topOfCategory',
       ] as const) {
         if (below[flag]) {
           expect(above[flag], `${LISTING_TIERS[i]} lost ${flag}`).toBe(true)
         }
       }

  }
  })

  /**
  - Bronze and silver differ in one thing, print, which is how they are sold:
    @@ -71,32 +79,44 @@ describe('the ladder holds its shape', () => {
    expect(bronze.printInclusion).toBe(false)
    expect(silver.printInclusion).toBe(true)
    expect(bronze.qrCode).toBe(false)
    expect(silver.qrCode).toBe(true)

  // The website listing itself is the same on both.
  expect(bronze.galleryLimit).toBe(silver.galleryLimit)
  })

  /**

* - Gold is silver with the top of the list and the home page band. Only a
* - magazine listing can buy it, which is the point: every silver listing must
* - come before every bronze one, so a website-only listing bought to the top
* - of the list is something that cannot be sold.

- - Gold is silver plus the top of its category; platinum is gold plus the
- - home page band. Only platinum has the home page.
    */

* it('puts the home page band on gold alone, on top of everything silver has', () => {
* const { bronze, silver, gold } = TIER_CAPABILITIES
* expect(gold.homePage).toBe(true)

- it('puts the top of the category on gold and platinum, the home page on platinum alone', () => {
- const { bronze, silver, gold, platinum } = TIER_CAPABILITIES
- expect(can('bronze', 'topOfCategory')).toBe(false)
- expect(can('silver', 'topOfCategory')).toBe(false)
- expect(can('gold', 'topOfCategory')).toBe(true)
- expect(can('platinum', 'topOfCategory')).toBe(true)
- expect(can('gold', 'homePage')).toBe(false)
- expect(can('platinum', 'homePage')).toBe(true)
  expect(silver.homePage).toBe(false)
  expect(bronze.homePage).toBe(false)

* expect(gold.printInclusion).toBe(true)
* expect(gold.qrCode).toBe(true)

- for (const t of [gold, platinum]) {
-      expect(t.printInclusion).toBe(true)
-      expect(t.qrCode).toBe(true)
- }
- })
-
- it('gives bronze the website only and silver the magazine with its printed code', () => {
- expect(can('bronze', 'printInclusion')).toBe(false)
- expect(can('bronze', 'qrCode')).toBe(false)
- expect(can('silver', 'printInclusion')).toBe(true)
- expect(can('silver', 'qrCode')).toBe(true)
  })

/** * The scan report counts scans of the listing's QR code, so a tier without a * code has nothing to report. Promising it to a bronze listing would be * selling an empty page.
*/
it('gives the scan report exactly where there is a code to scan', () => {
for (const tier of LISTING_TIERS) {
expect(can(tier, 'analyticsAccess'), tier).toBe(can(tier, 'qrCode'))
@@ -110,26 +130,26 @@ describe('the ladder holds its shape', () => {
it('mints no code for an unrecognised tier', () => {
expect(can(tierOf('nonsense'), 'qrCode')).toBe(false)
})

/** * The directory orders on `-tier`, which is the Postgres enum's declaration * order rather than anything this file computes. Reordering the array would * bury the magazine listings underneath the website-only ones.
*/
it('declares the tiers cheapest first, which is what sorts the dearest first', () => {

- expect(LISTING_TIERS).toEqual(['bronze', 'silver', 'gold'])

* expect(LISTING_TIERS).toEqual(['bronze', 'silver', 'gold', 'platinum'])
  })

- it('has room on the home page for as many gold listings as it shows', () => {
- expect(HOME_PAGE_PLACES).toBeGreaterThan(0)
- expect(Number.isInteger(HOME_PAGE_PLACES)).toBe(true)

* it('defaults both caps to six places', () => {
* expect(DEFAULT_MAX_GOLD_PER_CATEGORY).toBe(6)
* expect(DEFAULT_MAX_PLATINUM).toBe(6)
  })

/** `basic` was renamed `bronze` on 5 November 2026, with the same meaning. */
it('reads the old name of bronze as bronze', () => {
expect(tierOf('basic')).toBe('bronze')
})

/** * `listed` and `partner` were retired when four tiers became two, and * `featured` when it became a flag instead of a tier. An unknown tier falls to the lowest, so such a listing loses its standing rather than
diff --git a/packages/core/src/tiers.ts b/packages/core/src/tiers.ts
index c240ee55..ccb42d90 100644
--- a/packages/core/src/tiers.ts
+++ b/packages/core/src/tiers.ts
@@ -1,75 +1,91 @@
/**

- Listing tiers - the commercial model expressed as code.
-
- Everything a paying advertiser gets is declared here, and the UI reads these
- capabilities rather than hardcoding `if (tier === 'premium')` in twelve places.
- When sales invents a new package, add a tier here; do not special-case it in
- a component.
  */

/**

- - Three tiers, in enum order, a ladder where each rung is above the last:

* - Four tiers, in enum order, a ladder where each rung is above the last:
  -
  - - `bronze`: the listing on the website, and nothing in print. For a venue
  - that wants to be found online but does not buy a magazine page.
  - - `silver`: a page in the printed magazine, with the website listing
  - included. Every listing imported from the magazine lands here, so it is
  - also the default.

- - - `gold`: silver, plus first place in every listing grid and one of the
- - places in the band at the top of the home page ({@link HOME_PAGE_PLACES}).

* - - `gold`: silver, plus the top of its category: first place in the listing
* - grids of its category ({@link DEFAULT_MAX_GOLD_PER_CATEGORY} per category).
* - - `platinum`: gold, plus one of the places in the band at the top of the home
* - page ({@link DEFAULT_MAX_PLATINUM} in all).
  -
  - # Every silver listing comes before every bronze one
  -
  - That is the rule the ladder exists for. Until 5 November 2026 home page
  - placement was a separate `featured` flag either tier could buy, and the
  - directory sorted on it first, so a website-only listing that bought it rose
  - above every magazine listing. Sorting on the tier first instead would have
  - left a featured bronze listing behind a thousand silver ones, sold something
  - it could never show. So the flag became the top rung: only a magazine
  - listing can buy the top of the list, and every rung outranks the one below.
  -
  - The tiers were called `basic` and `silver` before that; `basic` became
  - `bronze` with the same meaning, and `tierOf` still reads the old name.
  -
  - Every tier is paid. Before this there were two, free and featured, and free
  - meant unpaid inventory; that changed when the website listing became what a
  - magazine page includes, and the website on its own something a venue can buy.
  -
  - The order matters beyond readability: every listing grid sorts on `-tier`,
  - and `-tier` is the Postgres enum's own declaration order, so gold comes

- - first, then silver, then bronze. Declare a new rung in its place on the

* - first, then gold, silver, bronze. Declare a new rung in its place on the
  - ladder, never at the end.
    */
    -export const LISTING_TIERS = ['bronze', 'silver', 'gold'] as const
    +export const LISTING_TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const
    export type ListingTier = (typeof LISTING_TIERS)[number]

/**

- - How many gold listings there can be, which is how many the home page band
- - shows, until an admin sets another number in the admin's Settings, Tiers
- - section (apps/web/src/globals/Settings). This is the default.

* - How many gold listings a category can hold, until an admin sets another
* - number in the admin's Settings, Tiers section (apps/web/src/globals/Settings).
* - This is the default.
  -

- - A gold listing that never appears in the band has been sold something it
- - does not get - the band is sorted and cut at the number of places, so one
- - more would silently lose out to whichever come first. The admin refuses it
- - instead, and refuses lowering the places below the gold listings sold.

* - Gold is the top of its category, so a seventh gold listing would be sold a
* - place it cannot show. The admin refuses it instead, and refuses lowering the
* - number below the gold listings a category already has. Platinum does not
* - count against it.
    */
    -export const HOME_PAGE_PLACES = 6
    +export const DEFAULT_MAX_GOLD_PER_CATEGORY = 6
*

+/**

- - How many platinum listings there can be, which is how many the home page
- - band shows, until an admin sets another number in Settings. This is the
- - default. The same reasoning as gold: a platinum listing that never appears
- - in the band has been sold something it does not get.
- */
  +export const DEFAULT_MAX_PLATINUM = 6

export interface TierCapabilities {
/** Sort weight in directory results. Higher floats to the top within a category. _/
rank: number
/_*

- - A place in the band at the top of the home page. Gold only, and limited to
- - {@link HOME_PAGE_PLACES} listings.

* - A place in the band at the top of the home page. Platinum only, and limited
* - to {@link DEFAULT_MAX_PLATINUM} listings (or the admin's setting).
    */
    homePage: boolean
* /**
* - First place in the listing grids of its own category. Gold and platinum,
* - limited per category to {@link DEFAULT_MAX_GOLD_PER_CATEGORY} gold listings
* - (or the admin's setting).
* */
* topOfCategory: boolean
  /** Max images in the public gallery. _/
  galleryLimit: number
  /_* Gets a long-form editorial feature written by the Vardenia team. _/
  editorialFeature: boolean
  /_*
  - Gets a QR code. The code is printed beside the listing's magazine page, so
  - it comes with print: a website-only listing has nowhere for one to appear.
  - `ensureQrCode` mints one only for a tier that has this, and the print sheet
  - leaves out codes whose listing has moved to a tier without it.
    */
    @@ -97,50 +113,65 @@ export interface TierCapabilities {

export const TIER_CAPABILITIES: Record<ListingTier, TierCapabilities> = {
/** * The website listing on its own. It is a paid tier, so the listing page is * the full one, gallery included. What it lacks is print, which is what the * tier above sells, and with print the QR code and its scan report.
*/
bronze: {
rank: 0,
homePage: false,

- topOfCategory: false,
  galleryLimit: 15,
  editorialFeature: false,
  qrCode: false,
  analyticsAccess: false,
  printInclusion: false,
  pushCampaigns: false,
  },
  /** * A page in the magazine, with the website listing included. The magazine * page is the editorial feature, so both flags go together.
  */
  silver: {
  rank: 5,
  homePage: false,
- topOfCategory: false,
  galleryLimit: 15,
  editorialFeature: true,
  qrCode: true,
  analyticsAccess: true,
  printInclusion: true,
  // Not until the app has users. See the note on the field.
  pushCampaigns: false,
  },
  /**

* - Everything silver has, plus the top of every list and the home page band.
* - It includes the magazine page, so a website-only venue cannot buy the top
* - of the list without being in print.

- - Everything silver has, plus the top of its category. It includes the
- - magazine page, so a website-only venue cannot buy the top of the list
- - without being in print.
    */
    gold: {
    rank: 10,
- homePage: false,
- topOfCategory: true,
- galleryLimit: 15,
- editorialFeature: true,
- qrCode: true,
- analyticsAccess: true,
- printInclusion: true,
- pushCampaigns: false,
- },
- /** Everything gold has, plus a place in the band at the top of the home page. */
- platinum: {
- rank: 15,
  homePage: true,
- topOfCategory: true,
  galleryLimit: 15,
  editorialFeature: true,
  qrCode: true,
  analyticsAccess: true,
  printInclusion: true,
  pushCampaigns: false,
  },
  }

/**
