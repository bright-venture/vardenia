import {
  CONTACT_FIELDS,
  canHaveBrand,
  canHaveRoomTypes,
  facilityProblem,
  isWholePropertyStay,
  canHaveSeatingAreas,
  hotelFacilityOptions,
  propertyHighlightOptions,
  isInRange,
  normaliseContact,
  validContactValue,
  type ContactField,
  type NumberRange,
} from '@vardenia/core'
import type { CollectionConfig, Field, PayloadRequest } from 'payload'
import {
  GOVERNORATES,
  SUBCATEGORY_PARENT,
  amenityOptions,
  isValidPoint,
  mapsUrlProblem,
  priceRangeOptions,
} from '@vardenia/core'
import {
  isAdminFieldLevel,
  isStaff,
  isStaffFieldLevel,
  publishedStaffOrOwned,
  staffOrOwnedListing,
} from '../access/index'
import { slugField } from '../fields/slug'
import { seoField } from '../fields/seo'
import { tierField } from '../fields/tier'
import { commissionField } from '../fields/commission'
import { bookingRulesField } from '../fields/bookingRules'
import { featuresField, stayField } from '../fields/stay'
import { guardKindFields } from '../hooks/guardKindFields'
import { protectSeatingAreaBookings } from '../hooks/protectSeatingAreaBookings'
import { seatingAreasField } from '../fields/seatingAreas'
import { categoryOptions, districtOptions, governorateOptions, subcategoryOptions } from './options'
import { ensureQrCode } from '../hooks/ensureQrCode'
import { fillLocationFromMapUrl } from '../hooks/fillLocationFromMapUrl'
import { releaseListingNumber } from '../hooks/releaseListingNumber'
import {
  approveSubmissionOnPublish,
  linkPartnerOnPublish,
  refusePublishingRejected,
} from '../hooks/linkPartnerOnPublish'
import { protectBusinessWithPrintedCode } from '../hooks/protectPrintedCodes'
import { blockBusinessWithBookings } from '../hooks/blockBusinessWithBookings'
import { cleanupSavedListings } from '../hooks/cleanupSavedListings'
import { guardSort } from '../hooks/guardSort'
import { guardPartnerListingWrite } from '../hooks/guardPartnerListingWrite'
import { markMediaAttached } from '../hooks/markMediaAttached'
import { syncBrandPublished } from '../hooks/syncBrandPublished'
import { autoTranslateListing } from '../hooks/autoTranslateListing'
import {
  revalidateListingsAfterChange,
  revalidateListingsAfterDelete,
} from '../hooks/revalidateListings'

/** Staff read and change the submission; nobody creates it through the API. */
const submissionAccess = {
  read: isStaffFieldLevel,
  create: () => false,
  update: isStaffFieldLevel,
}

const CONTACT_LABELS: Record<ContactField, string> = {
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  email: 'Email',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
  youtube: 'YouTube',
  x: 'X',
  linkedin: 'LinkedIn',
}

/**
 * One public contact field. No `access.read`: contact details are shown on the
 * listing page, so anyone may read them. A social handle is turned into its
 * full URL before validation runs.
 */
const contactField = (name: ContactField): Field => {
  const common = {
    name,
    label: CONTACT_LABELS[name],
    hooks: { beforeValidate: [({ value }: { value?: unknown }) => normaliseContact(name, value)] },
    validate: (value: unknown) => validContactValue(name, value),
  }
  return name === 'email'
    ? { ...common, type: 'email' }
    : { ...common, type: 'text', maxLength: 300 }
}

/**
 * What facilityProblem needs to judge one facility field: the kinds of place,
 * this field's own value, and the list a popular facility must be drawn from.
 */
const picksOf = (
  data: Record<string, unknown>,
  name: 'facilities' | 'popularFacilities' | 'propertyHighlights',
  value: unknown,
) => {
  const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : null)
  return {
    subcategories: list(data?.subcategories),
    ...(name === 'popularFacilities' ? { facilities: list(data?.facilities) } : {}),
    [name]: list(value),
  }
}

const idOf = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

/**
 * A listing number must be a whole number inside its governorate's range for
 * the chosen issue, and not held by another listing of that issue.
 *
 * The holder lookup only gives staff a readable answer naming who has it; the
 * unique index on (issue, listingNumber) still decides a race between two saves.
 */
export const validListingNumber = async (
  value: unknown,
  { data, id, req }: { data?: unknown; id?: number | string; req?: PayloadRequest },
): Promise<true | string> => {
  if (value === null || value === undefined || value === '') return true
  const n = Number(value)
  if (!Number.isInteger(n)) return 'A listing number is a whole number, like 12.'
  const { issue, governorate } = (data ?? {}) as { issue?: unknown; governorate?: string }
  const issueId = idOf(issue)
  if (issueId === null) return 'Choose the magazine issue before giving a listing number.'
  if (!governorate || !req?.payload) return true

  const found = await req.payload.find({
    collection: 'listing-ranges',
    where: { and: [{ issue: { equals: issueId } }, { governorate: { equals: governorate } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const range = found.docs[0] as unknown as NumberRange | undefined
  if (!range) return `This issue has no number range for ${governorate} yet.`
  if (!isInRange(n, range)) {
    return `Listing numbers for ${governorate} run from ${range.from} to ${range.to}.`
  }

  // Trashed listings are not found, and they have given their number back.
  const held = await req.payload.find({
    collection: 'businesses',
    where: {
      and: [
        { issue: { equals: issueId } },
        { listingNumber: { equals: n } },
        ...(id !== undefined && id !== null ? [{ id: { not_equals: id } }] : []),
      ],
    },
    select: { name: true },
    // No `locale` here: the local API would write it onto the shared `req` and
    // change the locale of the save being validated. The request's own locale,
    // with the config's fallback to the default, gives the name staff read.
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const holder = held.docs[0] as unknown as { id: number | string; name?: unknown } | undefined
  if (!holder) return true
  const name = typeof holder.name === 'string' && holder.name ? holder.name : 'another listing'
  return `Number ${n} is already held by "${name}" (listing ${holder.id}) in this issue. Choose another number.`
}

/**
 * The directory listing - the central document in the whole platform.
 *
 * Staff edit everything. An owner sees their own through a partner account
 * (business-users), which publishing a listing submitted through the public
 * form creates or links; that form only ever writes drafts. Since Task 3 the
 * owner also edits the public, allow-listed fields of their own listings, live
 * at once (core PARTNER_EDITABLE_FIELDS, hooks/guardPartnerListingWrite). The split
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
  /**
   * No versions, and a trash (17 November 2026).
   *
   * Listings used Payload's drafts, which kept every save as a full copy in the
   * `_businesses_v*` tables. Nobody used that history: a hotel or a restaurant
   * is only ever shown or hidden. So the copies were dropped (migration
   * 20261117_drop_business_versions) and draft/published became the plain
   * `_status` field below, a column on `businesses` itself. Saving changes the
   * live listing at once.
   *
   * `trash` makes Delete move a listing to the trash: the row stays, with
   * `deletedAt` set, hidden everywhere Payload reads, and it can be restored.
   * Its bookings, receipts and statements keep pointing at it. Deleting from
   * the trash is the permanent delete, and the guards below still apply to it.
   */
  trash: true,
  // Numbers are per issue. Many listings have none (NULLs do not collide), and
  // older ones keep null.
  indexes: [{ fields: ['issue', 'listingNumber'], unique: true }],
  access: {
    read: publishedStaffOrOwned,
    create: isStaff,
    // A partner updates the listings attached to their account, only the
    // allow-listed fields (hooks/guardPartnerListingWrite). Creating and
    // deleting a listing stay with the team.
    update: staffOrOwnedListing,
    delete: isStaff,
  },
  hooks: {
    /**
     * Sorting is not covered by field-level read access, so an anonymous caller
     * could order listings by `contractEndsAt` and read off the ranking of a
     * field whose values are correctly hidden. See hooks/guardSort.
     */
    // A partner may change only core PARTNER_EDITABLE_FIELDS of their own
    // listing, and attach only media they uploaded. See
    // hooks/guardPartnerListingWrite.
    beforeOperation: [guardSort, guardPartnerListingWrite],
    // Every listing on a printed tier gets a QR code automatically; bronze, the
    // website-only tier, gets none. Sales should never have to remember to press
    // a button before a print deadline.
    // The cached directory is keyed per filter, so publishing has to clear all
    // of them or the unfiltered view keeps serving an answer from before the
    // listing existed. See hooks/revalidateListings.
    // A rejected submission cannot be published; publishing approves it in the
    // same write. See hooks/linkPartnerOnPublish.
    // Stay and features on guest houses only, facilities on hotels only, on
    // every save (the admin hides those tabs, which skips field validation).
    // See hooks/guardKindFields.
    // Seating areas are never removed or shrunk under upcoming bookings
    // (Task 8). See hooks/protectSeatingAreaBookings.
    beforeValidate: [
      refusePublishingRejected,
      fillLocationFromMapUrl,
      guardKindFields,
      protectSeatingAreaBookings,
    ],
    beforeChange: [approveSubmissionOnPublish, releaseListingNumber],
    afterChange: [
      ensureQrCode,
      linkPartnerOnPublish,
      autoTranslateListing,
      // A partner's photo becomes public once it is on a listing. See
      // hooks/markMediaAttached and access mediaRead.
      markMediaAttached,
      // A brand is public while one of its listings is published (Task 9).
      // See hooks/syncBrandPublished and collections/Brands.
      syncBrandPublished,
      revalidateListingsAfterChange,
    ],
    afterDelete: [syncBrandPublished, revalidateListingsAfterDelete],
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
            {
              /**
               * How a guest can pay the venue, each a plain yes or no.
               *
               * Vardenia never takes the money, so "you pay the venue" is true of
               * every booking; how is not. Cards are far from universal in
               * Lebanon, and a guest who arrives with only a card at a cash-only
               * place has a bad evening. Shown under the Book button only when
               * at least one is ticked, so an unknown listing says nothing
               * rather than something wrong. See components/BookingPanel.
               */
              name: 'payments',
              label: 'Payment accepted',
              type: 'group',
              admin: {
                description:
                  'Tick what the venue accepts. Shown to guests next to the Book button; leave all empty if unknown.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'cash', label: 'Cash', type: 'checkbox', defaultValue: false },
                    {
                      name: 'card',
                      label: 'Visa / Mastercard',
                      type: 'checkbox',
                      defaultValue: false,
                    },
                    { name: 'whish', label: 'Whish', type: 'checkbox', defaultValue: false },
                    { name: 'omt', label: 'OMT', type: 'checkbox', defaultValue: false },
                  ],
                },
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
              /**
               * The restaurant brand this listing is a branch of (Task 9).
               * Restaurants only (hooks/guardKindFields). Staff set it; a
               * partner cannot (not on core PARTNER_EDITABLE_FIELDS, and
               * staff-only here): the branch endpoint sets it with
               * overrideAccess. Public: the brand page lists its branches.
               */
              name: 'brand',
              type: 'relationship',
              relationTo: 'brands',
              index: true,
              access: { create: isStaffFieldLevel, update: isStaffFieldLevel },
              admin: {
                condition: (data) => canHaveBrand((data?.subcategories as string[]) ?? []),
                description: 'The restaurant brand this listing is a branch of. Restaurants only.',
              },
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
            {
              /**
               * The neighbourhood or town guests filter by (18 November 2026):
               * Achrafieh, Faraya. Only the chosen region's areas are offered.
               * Manage the list under Directory > Areas.
               */
              name: 'area',
              type: 'relationship',
              relationTo: 'areas',
              index: true,
              filterOptions: ({ data }) =>
                data?.governorate ? { governorate: { equals: data.governorate } } : true,
              admin: {
                description:
                  'The neighbourhood or town, for the directory filter. Only the region above is offered.',
              },
            },
            { name: 'address', type: 'textarea', localized: true },
            {
              // Public. A pasted Google Maps link; the point below is filled from
              // it when it carries coordinates (hooks/fillLocationFromMapUrl).
              name: 'mapUrl',
              type: 'text',
              maxLength: 2000,
              admin: {
                description:
                  'The listing on Google Maps. Shown as "View on map" and "Get directions". When the link carries coordinates the location below is filled from it; a short link (maps.app.goo.gl) is kept as it is.',
              },
              validate: (value: unknown) =>
                typeof value !== 'string' || value.trim() === ''
                  ? true
                  : mapsUrlProblem(value) || true,
            },
            {
              // Public: "near me" search and directions use it. [longitude, latitude].
              name: 'location',
              type: 'point',
              index: true,
              admin: {
                description:
                  'Filled from the map link above when it carries coordinates (paste the link there, not here), or set directly as longitude then latitude. Drives "near me" search and directions.',
              },
              validate: (value: unknown) =>
                value === null || value === undefined || isValidPoint(value)
                  ? true
                  : 'The location must be a longitude (-180 to 180) and a latitude (-90 to 90).',
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
          /**
           * The hotel's rooms, in one place (18 November 2026): its room types
           * and the nights each is open, listed from their own collections
           * (join fields, nothing stored here) with Create new beside each.
           * Only for hotels, the kind that sells rooms (getaways are sold
           * whole since 20 November 2026: the Stay tab below).
           */
          label: 'Rooms',
          description:
            'Room types and the nights each is open. Guests can only book nights that are open (closed until opened). Partners manage the same from their Rooms tab.',
          admin: {
            condition: (data) => canHaveRoomTypes((data?.subcategories as string[]) ?? []),
          },
          fields: [
            {
              /**
               * What the hotel offers, in Booking.com's standard facility names
               * (core hotel-options; the lists still need the tech lead's
               * confirmation, the Booking.com page could not be read). Public,
               * and valid only on a listing that can have room types.
               */
              name: 'facilities',
              label: 'Facilities',
              type: 'select',
              hasMany: true,
              options: hotelFacilityOptions,
              validate: (value: unknown, { data }: { data: Record<string, unknown> }) =>
                facilityProblem(picksOf(data, 'facilities', value)) ?? true,
            },
            {
              name: 'popularFacilities',
              label: 'Most popular facilities',
              type: 'select',
              hasMany: true,
              options: hotelFacilityOptions,
              admin: { description: 'Up to 8, chosen from the facilities above.' },
              validate: (value: unknown, { data }: { data: Record<string, unknown> }) =>
                facilityProblem(picksOf(data, 'popularFacilities', value)) ?? true,
            },
            {
              name: 'propertyHighlights',
              label: 'Property highlights',
              type: 'select',
              hasMany: true,
              options: propertyHighlightOptions,
              admin: { description: 'Up to 6 headline strengths.' },
              validate: (value: unknown, { data }: { data: Record<string, unknown> }) =>
                facilityProblem(picksOf(data, 'propertyHighlights', value)) ?? true,
            },
            {
              name: 'roomTypeList',
              label: 'Room types',
              type: 'join',
              collection: 'room-types',
              on: 'business',
              defaultSort: 'order',
              admin: {
                defaultColumns: ['name', 'kind', 'rooms', 'sleepsAdults', 'active'],
                allowCreate: true,
              },
            },
            {
              name: 'roomDateList',
              label: 'Open dates',
              type: 'join',
              collection: 'room-availability',
              on: 'business',
              defaultSort: 'startsOn',
              // Loads each entry's room type, so the list shows its name.
              maxDepth: 1,
              admin: {
                defaultColumns: ['roomType', 'startsOn', 'endsOn', 'rooms'],
                allowCreate: true,
              },
            },
          ],
        },
        {
          /**
           * A guest house, booked as a whole property (Task 6, 20 November
           * 2026): its nightly price, guests, packages and features. Public,
           * managed by the owner, only for Getaways (fields/stay).
           */
          label: 'Stay',
          description:
            'Booked as a whole property: one stay at a time, for nights. Partners manage the same from their dashboard.',
          admin: {
            condition: (data) => isWholePropertyStay((data?.subcategories as string[]) ?? []),
          },
          fields: [stayField, featuresField],
        },
        {
          /**
           * Restaurant seating areas (Task 8, 20 November 2026): indoor or
           * outdoor, smoking or not, each with its own tables. Public, managed
           * by the owner, only for restaurants (fields/seatingAreas).
           */
          label: 'Seating',
          description:
            'Where guests can sit, each area with its own tables. Partners manage the same from their dashboard.',
          admin: {
            condition: (data) => canHaveSeatingAreas((data?.subcategories as string[]) ?? []),
          },
          fields: [seatingAreasField],
        },
        {
          label: 'Commercial',
          // Staff-only. Nothing in this tab is ever exposed by the public API.
          admin: { condition: (_, __, { user }) => hasStaffRole(user) },
          fields: [
            tierField,
            commissionField,
            {
              name: 'verified',
              type: 'checkbox',
              defaultValue: false,
              // As tier: staff cannot create a listing already marked verified.
              access: { create: isAdminFieldLevel, update: isAdminFieldLevel },
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
                  'The day after this date the listing is hidden from the website automatically (Status goes back to Draft). The business still sees it in its partner area. To renew, move this date forward and set Status to Published. Leave it empty for no end.',
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
              // Written only by the importer, which overrides access. Anyone else
              // setting it, on create or update, could tag a listing for another
              // batch's removal script to delete.
              access: { read: isStaffFieldLevel, create: () => false, update: () => false },
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

    /**
     * Shown on the website or hidden. Kept under the name drafts gave it, so
     * the column, its values and every query that reads `_status` are exactly
     * as they were. Draft is the default, so a new or imported listing stays
     * hidden until someone publishes it. lib/contract-lapse sets it back to
     * Draft the day after the contract ends.
     */
    {
      name: '_status',
      label: 'Status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: [
        { label: 'Draft (hidden)', value: 'draft' },
        { label: 'Published (on the website)', value: 'published' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Only published listings appear on the website.',
      },
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
    {
      name: 'issue',
      label: 'Magazine issue',
      type: 'relationship',
      relationTo: 'issues',
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'listingNumber',
      label: 'Listing number',
      type: 'number',
      index: true,
      min: 1,
      validate: validListingNumber,
      admin: {
        position: 'sidebar',
        step: 1,
        description:
          'The number in the printed magazine, from the range of this governorate in the chosen issue.',
      },
    },
    {
      /**
       * Public contact details the business manages: shown on its page. Every
       * field is optional and public-readable; staff-only data lives elsewhere.
       */
      name: 'contact',
      type: 'group',
      fields: CONTACT_FIELDS.map(contactField),
    },
    {
      /**
       * What the owner typed into the public submission form, and where staff
       * are in reviewing it. Staff-only at the field level: the public route
       * writes it with overrideAccess, and nobody else can create it, read it
       * or change it through the API.
       */
      name: 'submission',
      type: 'group',
      admin: { condition: (_, __, { user }) => hasStaffRole(user) },
      fields: [
        {
          name: 'status',
          type: 'select',
          // No default on purpose: a listing staff create themselves has no
          // status. The public submission service sets 'pending' itself.
          options: [
            { label: 'Pending', value: 'pending' },
            { label: 'Approved', value: 'approved' },
            { label: 'Rejected', value: 'rejected' },
          ],
          access: submissionAccess,
        },
        { name: 'ownerName', type: 'text', access: submissionAccess },
        { name: 'ownerEmail', type: 'email', access: submissionAccess },
        { name: 'ownerPhone', type: 'text', access: submissionAccess },
        {
          name: 'pageTemplate',
          type: 'select',
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
            { label: 'C', value: 'c' },
          ],
          access: submissionAccess,
        },
        { name: 'submittedAt', type: 'date', access: submissionAccess },
      ],
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
