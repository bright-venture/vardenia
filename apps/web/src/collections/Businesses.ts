import type { CollectionConfig } from 'payload'
import { amenityOptions, isWithinLebanon, priceRangeOptions } from '@vardenia/core'
import {
  isAdminFieldLevel,
  isStaff,
  isStaffFieldLevel,
  publishedStaffOrOwned,
} from '../access/index'
import { slugField } from '../fields/slug'
import { seoField } from '../fields/seo'
import { featuredField, tierField } from '../fields/tier'
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
export const Businesses: CollectionConfig = {
  slug: 'businesses',
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
              admin: { description: 'Must belong to the selected category.' },
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
            { name: 'district', type: 'select', index: true, options: districtOptions },
            { name: 'address', type: 'textarea', localized: true },
            {
              name: 'location',
              type: 'point',
              index: true,
              admin: {
                description: 'Drives "near me" search and Google Maps directions.',
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
              admin: { description: 'Leave empty if hours vary. Powers the "Open now" filter.' },
              fields: [
                {
                  name: 'day',
                  type: 'select',
                  required: true,
                  options: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => ({
                    label: d.toUpperCase(),
                    value: d,
                  })),
                },
                { name: 'opens', type: 'text', admin: { placeholder: '09:00' } },
                { name: 'closes', type: 'text', admin: { placeholder: '23:00' } },
                { name: 'closed', type: 'checkbox', defaultValue: false },
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
              type: 'date',
              access: { read: isStaffFieldLevel },
            },
            {
              name: 'contractEndsAt',
              type: 'date',
              index: true,
              access: { read: isStaffFieldLevel },
              admin: {
                description:
                  'Nothing happens automatically on this date. The listing keeps its tier until someone changes it. Sort the Businesses list by this column to find lapsed accounts.',
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
      ],
    },

    {
      name: 'qrCode',
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
