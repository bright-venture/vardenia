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
import { upload } from 'payload/shared'
import type { CollectionConfig, Field, PayloadRequest, UploadFieldSingleValidation } from 'payload'
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
import { categoryOptions, cityOptions, governorateOptions, subcategoryOptions } from './options'
import { ensureQrCode } from '../hooks/ensureQrCode'
import { fillLocationFromMapUrl } from '../hooks/fillLocationFromMapUrl'
import { releaseListingNumber } from '../hooks/releaseListingNumber'
import { syncOwnerPhoneSearch } from '../hooks/syncOwnerPhoneSearch'
import { staffSearch } from '../hooks/staffSearch'
import { HISTORY_STEPS, recordSubmissionHistory } from '../hooks/recordSubmissionHistory'
import { requireRejectionReason } from '../hooks/requireRejectionReason'
import {
  approveSubmissionOnPublish,
  linkPartnerOnPublish,
  notifyPublished,
  refusePublishingRejected,
  refusePublishingUnfinished,
  requireContractToPublish,
} from '../hooks/linkPartnerOnPublish'
import { protectBusinessWithPrintedCode } from '../hooks/protectPrintedCodes'
import { blockBusinessWithBookings } from '../hooks/blockBusinessWithBookings'
import { requireTrashFirst } from '../hooks/requireTrashFirst'
import { cleanupSavedListings } from '../hooks/cleanupSavedListings'
import { cleanupPlaceSessions } from '../hooks/cleanupPlaceSessions'
import { guardSort } from '../hooks/guardSort'
import { LISTING_STATES, listingState } from '../lib/listing-state'
import { guardPartnerListingWrite } from '../hooks/guardPartnerListingWrite'
import { markMediaAttached } from '../hooks/markMediaAttached'
import { syncBrandPublished } from '../hooks/syncBrandPublished'
import { autoTranslateListing } from '../hooks/autoTranslateListing'
import { LIST_COLUMNS, LIST_DEFAULT_COLUMNS } from './businesses-list-columns'
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

/**
 * Written only by the payment engine (lib/place-payments) and the form's own
 * services, with overrideAccess inside their transaction, and by collection
 * hooks (publishing approves). Staff read them; nobody, staff included, sets
 * them through the admin form or the REST/GraphQL API: Payload drops such a
 * value in field-level beforeValidate and keeps the stored one. The admin
 * buttons call the action endpoints (submissions/payment-endpoints) instead.
 */
const engineAccess = {
  read: isStaffFieldLevel,
  create: () => false,
  update: () => false,
}

/** A money amount: dollars with cents, never negative. */
const moneyField = (name: string, description?: string): Field => ({
  name,
  type: 'number',
  min: 0,
  access: engineAccess,
  admin: { readOnly: true, step: 0.01, ...(description ? { description } : {}) },
})

const engineDate = (name: string, description?: string): Field => ({
  name,
  type: 'date',
  access: engineAccess,
  admin: {
    readOnly: true,
    date: { pickerAppearance: 'dayAndTime' },
    ...(description ? { description } : {}),
  },
})

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

/** Submission states in which a listing may have no main photo yet. */
const PHOTO_OPTIONAL_STATUSES = new Set(['incomplete', 'abandoned'])

/**
 * The main photo is required for every listing (staff-created ones, and every
 * submission state from pending on), except while the owner's form is
 * incomplete or after it was abandoned. `data` is the whole document being
 * saved (an update is merged with the stored one first), so a write that only
 * touches the status is judged against the stored photo.
 */
export const validHeroImage: UploadFieldSingleValidation = async (value, options) => {
  const status = (options.data as { submission?: { status?: unknown } | null } | undefined)
    ?.submission?.status
  if (typeof status === 'string' && PHOTO_OPTIONAL_STATUSES.has(status)) return true
  // Payload's own upload validation, now with `required` switched on: the
  // required message, a valid id, and the field's filter options.
  return upload(value, { ...options, required: true })
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

/** Which governorate each city belongs to. */
const CITY_PARENT: Record<string, string> = Object.fromEntries(
  GOVERNORATES.flatMap((governorate) =>
    governorate.cities.map((city) => [city.slug, governorate.slug]),
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
    // The Magazine Places work columns (PRD v4 7.1, Task 11a): reference,
    // issue and page, form status, payment, money, days left, submitted. See
    // ./businesses-list-columns. Tier, contract end and State stay one click
    // away in the Columns picker (contract end is how expired accounts are
    // found: packages/core/src/tiers.ts).
    defaultColumns: LIST_DEFAULT_COLUMNS,
    group: 'Directory',
    // Staff find a submission by what they have in hand: its reference
    // (VD-123), the page number, the owner's name, email or phone. The phone is
    // searched in one normalised shape (submission.ownerPhoneSearch, see
    // lib/owner-phone-search); the raw phone is kept for rows saved before that
    // column existed. These are staff-only fields: Payload refuses a query on
    // one for anybody else, so adding them here discloses nothing.
    listSearchableFields: [
      'name',
      'slug',
      'address',
      'listingNumber',
      'submission.reference',
      'submission.ownerName',
      'submission.ownerEmail',
      'submission.ownerPhone',
      'submission.ownerPhoneSearch',
    ],
    components: {
      // The quick filters with counts, and the deadline filters, above the
      // list (lib/submission-queues). Plain filters in the address: nothing is
      // hidden from the default view.
      beforeListTable: ['/components/admin/SubmissionQueues#SubmissionQueues'],
    },
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
   * A permanent delete of a listing that is not in the trash is refused for a
   * signed-in person (hooks/requireTrashFirst).
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
    beforeOperation: [guardSort, staffSearch, guardPartnerListingWrite],
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
      requireRejectionReason,
      refusePublishingUnfinished,
      requireContractToPublish,
      fillLocationFromMapUrl,
      guardKindFields,
      protectSeatingAreaBookings,
    ],
    beforeChange: [
      approveSubmissionOnPublish,
      releaseListingNumber,
      syncOwnerPhoneSearch,
      recordSubmissionHistory,
    ],
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
      // E8 once a paid submission's publish has committed. Last, so a
      // failure above (the partner link) rolls back first and nothing is sent.
      notifyPublished,
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
      // Trash first, then the guards on the permanent delete. PRD v2 section 6.
      requireTrashFirst,
      protectBusinessWithPrintedCode,
      blockBusinessWithBookings,
      cleanupSavedListings('listing'),
      // Form-created businesses own upload sessions whose business_id is not
      // null; they must go before the row does (hooks/cleanupPlaceSessions).
      cleanupPlaceSessions,
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
              // Required, except while a Magazine Places form is unfinished
              // (the photo comes later, from the phone) or given up. The
              // column is nullable to match (migration 20261124_120000).
              validate: validHeroImage,
              admin: {
                description:
                  'Required for every listing except a submission that is still incomplete or abandoned.',
              },
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
              name: 'city',
              label: 'City',
              type: 'select',
              index: true,
              options: cityOptions,
              // Only the chosen governorate's cities, for the same reason.
              filterOptions: ({ options, data }) =>
                data?.governorate
                  ? options.filter((option) => CITY_PARENT[valueOf(option)] === data.governorate)
                  : options,
              validate: (value: unknown, { data }: { data: Partial<{ governorate: string }> }) =>
                !value || CITY_PARENT[String(value)] === data?.governorate
                  ? true
                  : 'That city is not in the chosen governorate.',
              admin: {
                description:
                  'The city or place guests filter by (Jounieh, Faqra / Faraya). Only the cities of the governorate above are offered.',
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
              // Fills the point below from a pasted link. See components/admin/MapsLinkField.
              name: 'locationFromLink',
              type: 'ui',
              admin: { components: { Field: '/components/admin/MapsLinkField#MapsLinkField' } },
            },
            {
              // Public: "near me" search and directions use it. [longitude, latitude].
              name: 'location',
              type: 'point',
              index: true,
              admin: {
                description:
                  'Filled by the link above. Drives "near me" search and Google Maps directions.',
              },
              // Within Lebanon, as before Task 4: core isValidPoint applies
              // isWithinLebanon, the one rule shared with the partner guard, the
              // branch endpoint and hooks/fillLocationFromMapUrl. A value that is
              // not two numbers at all is refused too (Task 4).
              validate: (value: unknown) => {
                if (value === null || value === undefined) return true
                if (isValidPoint(value)) return true
                const numbers = Array.isArray(value) && value.length === 2 ? value.map(Number) : []
                return numbers.length === 2 && numbers.every(Number.isFinite)
                  ? 'Coordinates fall outside Lebanon - check the lat/lng order.'
                  : 'The location must be a longitude then a latitude.'
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
                  'The day after this date the listing is hidden from the website automatically (Status goes back to Draft). The business still sees it in its partner area. To renew, move this date forward and set Status to Published. Required to publish a listing that came through the business form; otherwise leave it empty for no end.',
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
        condition: (data) => !data?.isSample,
        description:
          'The number in the printed magazine, from the range of this governorate in the chosen issue. Sample listings hold no number.',
      },
    },
    {
      name: 'isSample',
      label: 'Sample listing',
      type: 'checkbox',
      defaultValue: false,
      index: false,
      access: { read: isStaffFieldLevel, create: isAdminFieldLevel, update: isAdminFieldLevel },
      admin: {
        position: 'sidebar',
        description:
          'Mock listing shown to visitors but not a real business. Holds no magazine number. Admin only.',
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
          // One readable place for the review: owner, layout, dates, terms,
          // reference and the two photos. Display only; see the component.
          name: 'review',
          type: 'ui',
          admin: { components: { Field: '/components/admin/SubmissionReview#SubmissionReview' } },
        },
        {
          // "Payment and review" (Task 11b): status, money, the buttons valid
          // now (each posts to a server-checked endpoint), money list, history.
          // It holds the Reject: not accepted control (RejectSubmission), so
          // there is one Reject button. A ui field: nothing is stored.
          name: 'paymentPanel',
          type: 'ui',
          admin: {
            components: { Field: '/components/admin/PaymentReviewPanel#PaymentReviewPanel' },
          },
        },
        {
          name: 'status',
          type: 'select',
          // No default on purpose: a listing staff create themselves has no
          // status. The public form's services set it themselves.
          options: [
            // The Magazine Places form (spec v4, two-stage payment):
            // incomplete (form started, photos or terms still to do, number
            // held) -> awaiting_downpayment (sent, downpayment due within the
            // deadline) -> pending (downpayment received or waived: in review)
            // -> accepted (staff said yes, the rest is due) -> paid (fully
            // paid, ready to publish) -> approved (published).
            // incomplete -> abandoned when the hold runs out;
            // awaiting_downpayment -> lapsed when the downpayment is late;
            // accepted -> rejected (did not pay the rest); pending or
            // awaiting_downpayment -> rejected (not accepted).
            { label: 'Incomplete', value: 'incomplete' },
            { label: 'Abandoned', value: 'abandoned' },
            { label: 'Awaiting downpayment', value: 'awaiting_downpayment' },
            { label: 'In review (downpayment received)', value: 'pending' },
            { label: 'Accepted (awaiting the rest)', value: 'accepted' },
            { label: 'Fully paid (ready to publish)', value: 'paid' },
            { label: 'Lapsed (downpayment not paid in time)', value: 'lapsed' },
            { label: 'Approved', value: 'approved' },
            // Final: a rejected submission cannot be reopened or published.
            { label: 'Rejected', value: 'rejected' },
            // Set by the daily job when the contract ends (lib/contract-lapse).
            // Publishing again with a new end date makes it Approved.
            { label: 'Expired', value: 'expired' },
          ],
          access: engineAccess,
          admin: {
            readOnly: true,
            description: 'Changed only by the actions on this page (payments, accept, reject).',
          },
        },
        { name: 'ownerName', type: 'text', access: submissionAccess },
        { name: 'ownerEmail', type: 'email', access: submissionAccess },
        { name: 'ownerPhone', type: 'text', access: submissionAccess },
        {
          // The phone in one shape for the admin search, written by
          // hooks/syncOwnerPhoneSearch on every save. Never typed by hand.
          name: 'ownerPhoneSearch',
          type: 'text',
          access: submissionAccess,
          admin: { readOnly: true, hidden: true },
        },
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
        {
          // VD-<n>, made by lib/submission-reference. Unique where set (Postgres
          // lets any number of empty values sit in a unique column).
          name: 'reference',
          type: 'text',
          unique: true,
          access: submissionAccess,
          admin: { readOnly: true },
        },
        { name: 'acceptedAt', type: 'date', access: submissionAccess },
        {
          // Set only by the Reject action (lib/place-rejection), with who and
          // when. Staff only; the owner sees the reason only when it was shared.
          name: 'rejectionReason',
          type: 'textarea',
          access: submissionAccess,
          admin: { readOnly: true, description: 'Why it was rejected. Set by Reject submission.' },
        },
        {
          // Why a submission ended rejected: staff did not accept it, or the
          // owner did not pay the rest in time. Written by lib/place-payments.
          name: 'rejectionKind',
          type: 'select',
          options: [
            { label: 'Not accepted', value: 'not_accepted' },
            { label: 'Did not pay the rest', value: 'unpaid' },
          ],
          access: engineAccess,
          admin: { readOnly: true },
        },
        {
          name: 'rejectionReasonShared',
          type: 'checkbox',
          access: submissionAccess,
          admin: { readOnly: true, description: 'Whether the reason was sent to the owner.' },
        },
        { name: 'rejectedAt', type: 'date', access: submissionAccess, admin: { readOnly: true } },
        {
          name: 'rejectedBy',
          type: 'relationship',
          relationTo: 'users',
          access: submissionAccess,
          admin: { readOnly: true },
        },
        {
          // Each step of the submission: what, when, who. Append only, written
          // by hooks/recordSubmissionHistory. Holds no owner details.
          name: 'history',
          type: 'array',
          access: submissionAccess,
          admin: {
            readOnly: true,
            description: 'Each step of this submission, with who and when. Cannot be edited.',
          },
          fields: [
            {
              name: 'step',
              type: 'select',
              options: HISTORY_STEPS.map((o) => ({ label: o.label, value: o.value })),
              required: true,
            },
            { name: 'at', type: 'date', required: true },
            { name: 'by', type: 'relationship', relationTo: 'users' },
            // What was done, in a line: an amount, a reason. No owner details.
            { name: 'note', type: 'text' },
          ],
        },
        {
          // Every amount received or refunded, one line each. Append only: a
          // line is never edited or removed, only voided (with who, when and
          // why) by an admin's Undo. Written only by lib/place-payments. The
          // same Whish transfer (sender and time) can be recorded once across
          // all businesses: checked there under a lock.
          name: 'payments',
          type: 'array',
          access: engineAccess,
          admin: {
            readOnly: true,
            description:
              'Money received and refunded. Recorded with the buttons on this page; cannot be edited.',
          },
          fields: [
            {
              name: 'type',
              type: 'select',
              required: true,
              options: [
                { label: 'Downpayment', value: 'downpayment' },
                { label: 'Rest of the price', value: 'balance' },
                { label: 'Refund', value: 'refund' },
              ],
            },
            { name: 'amount', type: 'number', min: 0, required: true },
            { name: 'currency', type: 'text' },
            {
              // The number the money came from (or a refund went to), in the
              // normalised Lebanese shape (lib/lebanese-phone).
              name: 'senderNumber',
              type: 'text',
            },
            {
              name: 'whishAt',
              type: 'date',
              admin: { date: { pickerAppearance: 'dayAndTime' } },
            },
            {
              name: 'method',
              type: 'select',
              options: [
                { label: 'Whish', value: 'whish' },
                { label: 'At the desk', value: 'desk' },
                { label: 'Cash', value: 'cash' },
              ],
            },
            { name: 'note', type: 'textarea' },
            { name: 'recordedBy', type: 'relationship', relationTo: 'users' },
            {
              name: 'recordedAt',
              type: 'date',
              admin: { date: { pickerAppearance: 'dayAndTime' } },
            },
            { name: 'voided', type: 'checkbox', defaultValue: false },
            { name: 'voidedBy', type: 'relationship', relationTo: 'users' },
            { name: 'voidedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
            { name: 'voidReason', type: 'textarea' },
            {
              // A downpayment kept because the owner did not pay the rest.
              name: 'forfeited',
              type: 'checkbox',
              defaultValue: false,
            },
          ],
        },
        {
          // The money summary, worked out from the lines above and the
          // snapshot taken when the form was sent. Written only by
          // lib/place-payments. Staff only, never partner-editable.
          name: 'payment',
          type: 'group',
          access: engineAccess,
          fields: [
            {
              name: 'stage',
              type: 'select',
              defaultValue: 'none',
              options: [
                { label: 'Nothing paid', value: 'none' },
                { label: 'Downpayment paid', value: 'downpayment_paid' },
                { label: 'Downpayment waived', value: 'waived' },
                { label: 'Fully paid', value: 'fully_paid' },
                { label: 'Refund to send', value: 'refund_due' },
                { label: 'Refunded', value: 'refunded' },
                { label: 'Downpayment kept', value: 'kept' },
              ],
              access: engineAccess,
              admin: { readOnly: true },
            },
            moneyField('price', 'The full price, as it was when the form was sent.'),
            moneyField('downpaymentAmount', 'What is paid first.'),
            {
              name: 'currency',
              type: 'text',
              access: engineAccess,
              admin: { readOnly: true },
            },
            moneyField('received', 'Downpayment and rest received (undone lines not counted).'),
            moneyField('refunded'),
            moneyField('stillToPay'),
            engineDate('downpaymentDueAt'),
            {
              // Copied from the settings when the form is sent: accepting
              // sets balanceDueAt this many days later.
              name: 'balanceDeadlineDays',
              type: 'number',
              min: 1,
              access: engineAccess,
              admin: { readOnly: true },
            },
            engineDate('balanceDueAt'),
            // When each email went out, so a job or a retry never sends one
            // twice (lib/place-payment-notify).
            engineDate('downpaymentReminderSentAt'),
            engineDate('balanceReminderSentAt'),
            engineDate('submittedEmailSentAt'),
            engineDate('downpaymentEmailSentAt'),
            engineDate('acceptedEmailSentAt'),
            engineDate('notAcceptedEmailSentAt'),
            engineDate('unpaidEmailSentAt'),
            engineDate('lapsedEmailSentAt'),
            engineDate('publishedEmailSentAt'),
            {
              // The page number a lapsed submission gave back, so extending its
              // deadline can give it back again while nobody else holds it.
              name: 'lapsedListingNumber',
              type: 'number',
              access: engineAccess,
              admin: { readOnly: true },
            },
          ],
        },
        {
          // What the owner agreed to, copied when the form is sent so a later
          // price change never rewrites it.
          name: 'terms',
          type: 'group',
          access: submissionAccess,
          fields: [
            { name: 'version', type: 'text', access: submissionAccess },
            { name: 'priceAtAcceptance', type: 'number', min: 0, access: submissionAccess },
            { name: 'currency', type: 'text', access: submissionAccess },
            { name: 'termMonths', type: 'number', min: 1, access: submissionAccess },
            { name: 'acceptedAt', type: 'date', access: submissionAccess },
          ],
        },
      ],
    },
    {
      /**
       * Draft, Published, Rejected or Expired, worked out on read and never
       * stored (20 November 2026). The listing's own status is only Draft or
       * Published, so an expired or rejected listing looked like a new draft.
       * Staff only: it shows whether a contract has ended. lib/listing-state.
       */
      name: 'state',
      label: 'State',
      type: 'select',
      virtual: true,
      options: LISTING_STATES.map((value) => ({
        label: value.charAt(0).toUpperCase() + value.slice(1),
        value,
      })),
      access: { read: isStaffFieldLevel, create: () => false, update: () => false },
      admin: { position: 'sidebar', readOnly: true },
      hooks: { afterRead: [({ data }) => listingState(data)] },
    },
    // List columns only: store nothing, draw nothing on the form.
    ...LIST_COLUMNS,
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
