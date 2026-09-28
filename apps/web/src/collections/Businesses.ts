import type { CollectionConfig } from 'payload'
import {
  GOVERNORATES,
  SUBCATEGORY_PARENT,
  amenityOptions,
  isWithinLebanon,
  priceRangeOptions,
} from '@vardenia/core'
import {
  isAdminFieldLevel,
  isStaff,
  isStaffFieldLevel,
  publishedStaffOrOwned,
} from '../access/index'
import { slugField } from '../fields/slug'
import { seoField } from '../fields/seo'
import { featuredField, tierField } from '../fields/tier'
import { bookingFeeField } from '../fields/bookingFee'
import { bookingRulesField } from '../fields/bookingRules'
import { categoryOptions, districtOptions, governorateOptions, subcategoryOptions } from './options'
import { ensureQrCode } from '../hooks/ensureQrCode'
import { protectBusinessWithPrintedCode } from '../hooks/protectPrintedCodes'
import { blockBusinessWithBookings } from '../hooks/blockBusinessWithBookings'
import { cleanupSavedListings } from '../hooks/cleanupSavedListings'
import { guardSort } from '../hooks/guardSort'
import { autoTranslateListing } from '../hooks/autoTranslateListing'
import {
  revalidateListingsAfterChange,
  revalidateListingsAfterDelete,
} from '../hooks/revalidateListings'

/**
 * The directory listing - the central document in the whole platform.
 *
 * Only Vardenia staff edit these; listed businesses have no accounts. The split
 * that still matters is between the first four tabs, which describe what the
 * public sees, and the "Commercial" tab, whose contract fields carry field-level
 * read rules so they never reach an API response.
 */
/** An option's value, whichever of Payload's two option shapes it is. */
const valueOf = (option: string | { value: string }) =>
  typeof option === 'string' ? option : option.value

/** Which governorate each district belongs to. */
const DISTRICT_PARENT: Record<string, string> = Object.fromEntries(
  GOVERNORATES.flatMap((governorate) =>
    governorate.districts.map((district) => [district.slug, governorate.slug]),
  ),
)

/** "09:00" or "23:30", 24-hour; "24:00" allowed as a closing time. Empty is fine. */
/** The days, in the order a week is read, with their names. */
export const DAYS = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
] as const

export const validTime = (value: unknown) =>
  !value || /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(String(value))
    ? true
    : 'Use 24-hour time with a colon, like 09:00 or 23:30.'

export const Businesses: CollectionConfig = {
  slug: 'businesses',
  labels: { singular: 'Listing', plural: 'Listings' },
  admin: {
    useAsTitle: 'name',
    // `contractEndsAt` is here because expiry is handled by a person, not by
    // code (see packages/core/src/tiers.ts). A lapsed listing keeps everything
    // it was paying for until someone notices, so the list has to make noticing
    // easy: sort by this column and the expired accounts come to the top.
    defaultColumns: ['name', 'category', 'governorate', 'tier', 'contractEndsAt', '_status'],
    group: 'Directory',
    listSearchableFields: ['name', 'slug', 'address'],
  },
  versions: { drafts: true, maxPerDoc: 25 },
  access: {
    read: publishedStaffOrOwned,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  hooks: {
    /**
     * Sorting is not covered by field-level read access, so an anonymous caller
     * could order listings by `contractEndsAt` and read off the ranking of a
     * field whose values are correctly hidden. See hooks/guardSort.
     */
    beforeOperation: [guardSort],
    // Every listing on a printed tier gets a QR code automatically; basic, the
    // website-only tier, gets none. Sales should never have to remember to press
    // a button before a print deadline.
    // The cached directory is keyed per filter, so publishing has to clear all
    // of them or the unfiltered view keeps serving an answer from before the
    // listing existed. See hooks/revalidateListings.
    afterChange: [ensureQrCode, autoTranslateListing, revalidateListingsAfterChange],
    afterDelete: [revalidateListingsAfterDelete],
    // Deleting a listing strands its printed code, because recreating the
    // listing mints a new one. Refused rather than warned about.
    // Bookings are the other thing that makes a listing undeletable, and the
    // database already refused those - just not in words. See
    // hooks/blockBusinessWithBookings.
    // cleanupSavedListings last: it only runs once the guards above have let the
    // delete through, and it clears the saves that would otherwise fail the
    // delete on a not-null foreign key. See hooks/cleanupSavedListings.
    beforeDelete: [
      protectBusinessWithPrintedCode,
      blockBusinessWithBookings,
      cleanupSavedListings('listing'),
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true, localized: true, index: true },
    slugField('name'),
    { name: 'tagline', type: 'text', localized: true, maxLength: 120 },

    {
      type: 'tabs',
      tabs: [
        {
          label: 'Listing',
          fields: [
            {
              name: 'description',
              type: 'richText',
              localized: true,
            },
            {
              name: 'heroImage',
              type: 'upload',
              relationTo: 'media',
              required: true,
            },
            {
              name: 'gallery',
              type: 'upload',
              relationTo: 'media',
              hasMany: true,
              admin: {
                description:
                  'Gallery size is capped by listing tier - extra images are hidden, not deleted.',
              },
            },
            { name: 'logo', type: 'upload', relationTo: 'media' },

            {
              /**
               * A menu, as a file. Restaurants and cafes keep one as a PDF or a
               * photo, so this takes either (the media collection allows both)
               * and the listing shows a "View menu" link when it is set. Not
               * restricted to food listings - a hotel restaurant has a menu too -
               * but it is only shown when a file is attached, so a listing with
               * none is unaffected.
               */
              name: 'menu',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description:
                  'A PDF or photo of the menu. Shown as a "View menu" link on the listing.',
              },
            },

            {
              name: 'amenities',
              type: 'select',
              hasMany: true,
              index: true,
              options: amenityOptions,
            },
            {
              name: 'priceRange',
              type: 'select',
              index: true,
              options: priceRangeOptions,
            },
          ],
        },

        {
          label: 'Classification',
          fields: [
            {
              name: 'category',
              type: 'select',
              required: true,
              index: true,
              options: categoryOptions,
            },
            {
              name: 'subcategories',
              type: 'select',
              hasMany: true,
              // Filtered on by every section page. Without this the value column
              // of the join table has no index and each filter is a sequential
              // scan - free at two listings, not at ten thousand.
              index: true,
              options: subcategoryOptions,
              // Only the chosen category's subcategories are offered, and a
              // mismatch is refused. The list used to offer all of them with a
              // note asking staff to pick the right ones, and a listing filed
              // under the wrong parent is missing from its own section's filters.
              filterOptions: ({ options, data }) =>
                data?.category
                  ? options.filter(
                      (option) => SUBCATEGORY_PARENT[valueOf(option)] === data.category,
                    )
                  : options,
              validate: (value: unknown, { data }: { data: Partial<{ category: string }> }) => {
                const chosen = Array.isArray(value) ? (value as string[]) : []
                const stray = chosen.filter((sub) => SUBCATEGORY_PARENT[sub] !== data?.category)
                return stray.length === 0
                  ? true
                  : `Not part of the chosen category: ${stray.join(', ')}. Remove them or change the category.`
              },
              admin: { description: 'Only the subcategories of the category above are offered.' },
            },
            {
              name: 'tags',
              type: 'text',
              hasMany: true,
              admin: {
                description:
                  'Free-form editorial tags ("sunset", "hidden gem"). Powers curated collections.',
              },
            },
          ],
        },

        {
          label: 'Location',
          fields: [
            {
              name: 'governorate',
              type: 'select',
              required: true,
              index: true,
              options: governorateOptions,
            },
            {
              name: 'district',
              type: 'select',
              index: true,
              options: districtOptions,
              // Only the chosen governorate's districts, for the same reason.
              filterOptions: ({ options, data }) =>
                data?.governorate
                  ? options.filter(
                      (option) => DISTRICT_PARENT[valueOf(option)] === data.governorate,
                    )
                  : options,
              validate: (value: unknown, { data }: { data: Partial<{ governorate: string }> }) =>
                !value || DISTRICT_PARENT[String(value)] === data?.governorate
                  ? true
                  : 'That district is not in the chosen governorate.',
              admin: { description: 'Only the districts of the governorate above are offered.' },
            },
            { name: 'address', type: 'textarea', localized: true },
            {
              // Fills the point below from a pasted link. See components/admin/MapsLinkField.
              name: 'locationFromLink',
              type: 'ui',
              admin: { components: { Field: '/components/admin/MapsLinkField#MapsLinkField' } },
            },
            {
              name: 'location',
              type: 'point',
              index: true,
              admin: {
                description:
                  'Filled by the link above. Drives "near me" search and Google Maps directions.',
              },
              validate: (value: unknown) => {
                if (!Array.isArray(value)) return true
                const [lng, lat] = value as [number, number]
                if (typeof lat !== 'number' || typeof lng !== 'number') return true
                return (
                  isWithinLebanon(lat, lng) ||
                  'Coordinates fall outside Lebanon - check the lat/lng order.'
                )
              },
            },
            {
              name: 'openingHours',
              type: 'array',
              labels: { singular: 'Day', plural: 'Days' },
              admin: {
                description: 'Leave empty if hours vary. Powers the "Open now" filter.',
                // "Monday · 09:00 to 23:00" instead of "Opening Hour 01".
                components: { RowLabel: '/components/admin/OpeningHourLabel#OpeningHourLabel' },
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'day',
                      type: 'select',
                      required: true,
                      options: DAYS.map(([value, label]) => ({ label, value })),
                      admin: { width: '34%', isClearable: false },
                    },
                    // 24-hour times, checked: "9am" or "9.00" saved fine and then
                    // silently broke the "Open now" filter. Closing earlier than
                    // opening is allowed, because a bar closes after midnight.
                    {
                      name: 'opens',
                      type: 'text',
                      validate: validTime,
                      admin: {
                        placeholder: '09:00',
                        width: '33%',
                        condition: (_, row) => !row?.closed,
                      },
                    },
                    {
                      name: 'closes',
                      type: 'text',
                      validate: validTime,
                      admin: {
                        placeholder: '23:00',
                        width: '33%',
                        description: 'Can be after midnight, like 02:00.',
                        condition: (_, row) => !row?.closed,
                      },
                    },
                  ],
                },
                {
                  name: 'closed',
                  type: 'checkbox',
                  defaultValue: false,
                  label: 'Closed all day',
                },
              ],
            },
            {
              name: 'seasonality',
              type: 'select',
              hasMany: true,
              options: [
                { label: 'Year round', value: 'year-round' },
                { label: 'Summer', value: 'summer' },
                { label: 'Winter', value: 'winter' },
              ],
            },
          ],
        },

        {
          label: 'Bookings',
          description:
            'Reservations taken through Vardenia. Owners manage the bookings themselves; these rules stay with us.',
          fields: [bookingRulesField],
        },
        {
          label: 'Commercial',
          // Staff-only. Nothing in this tab is ever exposed by the public API.
          admin: { condition: (_, __, { user }) => hasStaffRole(user) },
          fields: [
            tierField,
            featuredField,
            bookingFeeField,
            {
              name: 'verified',
              type: 'checkbox',
              defaultValue: false,
              access: { update: isAdminFieldLevel },
              admin: { description: 'Vardenia has physically visited and vetted this business.' },
            },
            // The four below are staff-only at the FIELD level, not merely hidden
            // by the tab condition above. Without this they are serialised into
            // every unauthenticated /api/businesses response.
            {
              name: 'contractStartsAt',
              admin: { date: { displayFormat: 'd MMM yyyy' } },
              label: 'Contract starts',
              type: 'date',
              access: { read: isStaffFieldLevel },
            },
            {
              name: 'contractEndsAt',
              label: 'Contract ends',
              type: 'date',
              index: true,
              access: { read: isStaffFieldLevel },
              admin: {
                date: { displayFormat: 'd MMM yyyy' },
                description:
                  'Nothing happens automatically on this date. The listing keeps its tier until someone changes it. Sort the Listings list by this column to find lapsed accounts.',
              },
            },
            {
              name: 'salesOwner',
              type: 'relationship',
              relationTo: 'users',
              access: { read: isStaffFieldLevel },
              // Any team member can own the relationship with a business.
              filterOptions: { roles: { in: ['staff', 'admin'] } },
            },
            {
              name: 'internalNotes',
              type: 'textarea',
              access: { read: isStaffFieldLevel },
              admin: { description: 'Never shown publicly. Enforced by field access above.' },
            },

            /**
             * Which bulk import created this row, if any.
             *
             * # Why a listing needs to remember where it came from
             *
             * Imported listings are not customers. They are a directory bought
             * in bulk, and some of them are demo data that has to leave again
             * cleanly. Without a marker, "remove the demo listings" means
             * matching on names, and a name match will eventually take a real
             * listing with it.
             *
             * It is also the only thing that makes teardown safe. Deleting an
             * imported listing has to be allowed to remove a QR code that the
             * usual guard protects, and that permission is granted on the
             * strength of this field and nothing else. See
             * hooks/protectPrintedCodes and scripts/remove-import.
             *
             * Empty for anything a person created, which is what keeps the
             * escape hatch away from real listings.
             */
            {
              name: 'importBatch',
              type: 'text',
              index: true,
              access: { read: isStaffFieldLevel, update: isAdminFieldLevel },
              admin: {
                readOnly: true,
                description:
                  'Set by a bulk import. A listing carrying this can be removed by scripts/remove-import, including its QR code. Blank means a person created it.',
              },
            },
          ],
        },
        {
          /**
           * Everything attached to this listing - bookings, reviews, fee
           * statements, closed dates, QR codes - counted, with a link to each
           * list showing only this listing's. Nothing stored; see
           * components/admin/ListingActivity.
           */
          label: 'Activity',
          admin: { condition: (_, __, { user }) => hasStaffRole(user) },
          fields: [
            {
              name: 'activity',
              type: 'ui',
              admin: {
                components: { Field: '/components/admin/ListingActivity#ListingActivity' },
              },
            },
          ],
        },
      ],
    },

    {
      name: 'qrCode',
      label: 'QR code',
      type: 'relationship',
      relationTo: 'qr-codes',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          'Generated automatically on first save, for Silver listings only: Basic has no magazine page, so no code. Immutable once printed.',
      },
    },
    seoField,
  ],
}

/**
 * Whether to show the Commercial tab in the admin UI.
 *
 * Cosmetic only. `admin.condition` receives the user rather than the request, so
 * it cannot reuse the Access helpers. What actually keeps these fields private is
 * the field-level `read: isStaffFieldLevel` above; this just avoids showing an
 * empty tab to someone who cannot use it.
 */
function hasStaffRole(user: unknown): boolean {
  const roles = (user as { roles?: string[] } | null)?.roles ?? []
  return roles.some((role) => role === 'admin' || role === 'staff')
}
