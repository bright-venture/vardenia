import type { CollectionConfig } from 'payload'
import { LISTING_TIERS, isWithinLebanon } from '@vardenia/core'
import { isAdminFieldLevel, isStaff, isStaffFieldLevel, publishedOrStaff } from '../access/index'
import { slugField } from '../fields/slug'
import { seoField } from '../fields/seo'
import { categoryOptions, districtOptions, governorateOptions, subcategoryOptions } from './options'
import { ensureQrCode } from '../hooks/ensureQrCode'
import { protectBusinessWithPrintedCode } from '../hooks/protectPrintedCodes'

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
    read: publishedOrStaff,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  hooks: {
    // Every published listing gets a QR code automatically. Sales should never
    // have to remember to press a button before a print deadline.
    afterChange: [ensureQrCode],
    // Deleting a listing strands its printed code, because recreating the
    // listing mints a new one. Refused rather than warned about.
    beforeDelete: [protectBusinessWithPrintedCode],
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
              name: 'amenities',
              type: 'select',
              hasMany: true,
              options: [
                { label: 'Sea view', value: 'sea-view' },
                { label: 'Mountain view', value: 'mountain-view' },
                { label: 'Pool', value: 'pool' },
                { label: 'Spa', value: 'spa' },
                { label: 'Valet parking', value: 'valet-parking' },
                { label: 'Free parking', value: 'free-parking' },
                { label: 'Wheelchair accessible', value: 'accessible' },
                { label: 'Family friendly', value: 'family-friendly' },
                { label: 'Pet friendly', value: 'pet-friendly' },
                { label: 'Outdoor seating', value: 'outdoor-seating' },
                { label: 'Live music', value: 'live-music' },
                { label: 'Alcohol served', value: 'alcohol' },
                { label: 'Halal options', value: 'halal' },
                { label: 'Vegetarian options', value: 'vegetarian' },
                { label: 'Wi-Fi', value: 'wifi' },
                { label: 'Air conditioning', value: 'air-conditioning' },
              ],
            },
            {
              name: 'priceRange',
              type: 'select',
              options: [
                { label: '$ - Budget', value: '1' },
                { label: '$$ - Moderate', value: '2' },
                { label: '$$$ - Upscale', value: '3' },
                { label: '$$$$ - Luxury', value: '4' },
              ],
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
          label: 'Contact',
          fields: [
            { name: 'phone', type: 'text' },
            { name: 'whatsapp', type: 'text' },
            { name: 'email', type: 'email' },
            { name: 'website', type: 'text' },
            { name: 'reservationUrl', type: 'text', label: 'Reservation link' },
            { name: 'menuUrl', type: 'text', label: 'Menu link' },
            {
              name: 'socials',
              type: 'group',
              fields: [
                { name: 'instagram', type: 'text' },
                { name: 'facebook', type: 'text' },
                { name: 'tiktok', type: 'text' },
                { name: 'linkedin', type: 'text' },
                { name: 'youtube', type: 'text' },
              ],
            },
          ],
        },

        {
          label: 'Commercial',
          // Staff-only. Nothing in this tab is ever exposed by the public API.
          admin: { condition: (_, __, { user }) => hasStaffRole(user) },
          fields: [
            {
              name: 'tier',
              type: 'select',
              required: true,
              defaultValue: 'free',
              index: true,
              access: { update: isAdminFieldLevel },
              options: LISTING_TIERS.map((tier) => ({
                label: tier.charAt(0).toUpperCase() + tier.slice(1),
                value: tier,
              })),
            },
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
        description: 'Generated automatically on first publish. Immutable once printed.',
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
