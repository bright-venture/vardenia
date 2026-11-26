/**
 * Which fields of a listing its owner may change from the partner dashboard.
 *
 * Partners edit through Payload's ordinary update on `businesses`. Access lets a
 * business-user reach only the listings attached to their account; the guard
 * hook (apps/web hooks/guardPartnerListingWrite) then refuses any key in the
 * body that is not on this list, at the top level and inside groups and arrays.
 * An edit goes live at once on the published listing, so everything here must
 * be something the owner may say about themselves in public.
 *
 * One list, appended to by later tasks. Never add a name from
 * STAFF_ONLY_LISTING_FIELDS: the test beside this file fails if you do.
 */
export const PARTNER_EDITABLE_FIELDS = Object.freeze([
  'name',
  'tagline',
  'description',
  'heroImage',
  'gallery',
  'logo',
  'menu',
  'amenities',
  'payments',
  'openingHours',
  'seasonality',
  'address',
  'mapUrl',
  'location',
  'contact',
  'facilities',
  'popularFacilities',
  'propertyHighlights',
  'stay',
  'features',
  'seatingAreas',
  'tags',
] as const)

export type PartnerEditableField = (typeof PARTNER_EDITABLE_FIELDS)[number]

/**
 * Listing fields the team keeps, whatever a partner sends.
 *
 * Not used to decide anything at run time (the allow-list does that, so a
 * field nobody thought of is refused by default). It exists so the test can
 * prove the allow-list never grows into the team's side: status, the
 * commercial and contract fields, the magazine fields, the classification and
 * the location the directory filters by, the submission, and Payload's own
 * bookkeeping columns.
 */
export const STAFF_ONLY_LISTING_FIELDS = Object.freeze([
  '_status',
  'tier',
  'verified',
  'slug',
  'qrCode',
  'contractStartsAt',
  'contractEndsAt',
  'commission',
  'salesOwner',
  'internalNotes',
  'booking',
  'issue',
  'listingNumber',
  // Admin only: a mock listing, not a real business (sample listings).
  'isSample',
  'submission',
  'importBatch',
  'category',
  'subcategories',
  'governorate',
  'city',
  'brand',
  'state',
  'seo',
  'id',
  'createdAt',
  'updatedAt',
  'deletedAt',
] as const)
