import type { Access, CollectionConfig, Where } from 'payload'
import { isAdmin, isStaff, isStaffFieldLevel, isStaffUser } from '../access/index'

/**
 * A customer's review of a listing they actually booked.
 *
 * # Written by guests, approved by staff, shown to everyone
 *
 * A review is only ever created through the /reviews endpoint, which is the one
 * door: it proves the writer is a verified customer with a *completed* booking
 * for the listing, and refuses otherwise. So `create` is closed here - a generic
 * REST create would let anyone with an account review a place they never went.
 *
 * Every review lands as `pending` and shows to nobody until a staff member
 * publishes it. That is the curation the brand rests on, and the spam and abuse
 * gate: the bad review is caught before it is public, not hidden after.
 *
 * # What is public, and what is not
 *
 * `read` returns only published reviews to the public, all of them to staff.
 * `authorName` is a snapshot taken at submission (a first name and an initial),
 * so the display never joins the customers table and never exposes an address or
 * a full identity. The `customer` and `booking` relationships are the audit
 * trail - who wrote it, against which stay - and are staff-only at field level.
 */

const readReviews: Access = ({ req }) => {
  if (isStaffUser(req.user)) return true
  const published: Where = { status: { equals: 'published' } }
  return published
}

export const Reviews: CollectionConfig = {
  slug: 'reviews',
  admin: {
    // Can be grouped by listing in the list view (Group by, then Business), so
    // each listing's entries sit together. See the links on the admin home.
    groupBy: true,
    useAsTitle: 'authorName',
    defaultColumns: ['business', 'rating', 'status', 'authorName', 'createdAt'],
    group: 'Directory',
  },
  access: {
    read: readReviews,
    // The /reviews endpoint is the only writer, with overrideAccess. See its route.
    create: () => false,
    update: isStaff,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'business',
      type: 'relationship',
      relationTo: 'businesses',
      required: true,
      index: true,
    },
    { name: 'rating', type: 'number', required: true, min: 1, max: 5 },
    { name: 'title', type: 'text' },
    { name: 'body', type: 'textarea', required: true },
    {
      /**
       * The name shown on the review: a first name and an initial, snapshotted
       * when it was written. Stored rather than joined so the public read never
       * touches the customers table.
       */
      name: 'authorName',
      type: 'text',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Published', value: 'published' },
        { label: 'Rejected', value: 'rejected' },
      ],
    },
    {
      // The audit trail: staff-only, so a public read cannot map a review back to
      // an account.
      name: 'customer',
      type: 'relationship',
      relationTo: 'customers',
      access: { read: isStaffFieldLevel },
    },
    {
      name: 'booking',
      type: 'relationship',
      relationTo: 'bookings',
      access: { read: isStaffFieldLevel },
    },
  ],
}
