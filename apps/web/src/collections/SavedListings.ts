import type { Access, CollectionConfig } from 'payload'
import { isAdmin, isStaff } from '../access/index'

/**
 * A place a customer has saved to their shortlist. One customer, one listing.
 *
 * # Why this can be a collection a customer writes directly, when Bookings is not
 *
 * A booking carries money and an availability check, so its create is staff-only
 * and goes through an endpoint that inserts capacity-safely. A save carries
 * neither: it is a bookmark. So a customer may create and delete their own rows,
 * and the only thing that has to be guarded is that a save is always their own.
 *
 * The access rules are the substance of this file, as they are on Bookings, and
 * every one is a query constraint rather than a boolean, so Payload filters in
 * the database. A customer asking `/api/saved-listings` must see their own saves
 * and learn nothing about anyone else's, not even from a total count.
 *
 * Duplicates are prevented at the point of writing (see app/save/route.ts, which
 * toggles rather than blindly inserts), not by a database constraint, because the
 * toggle needs to read the existing row anyway to know whether to add or remove.
 */

/** A customer's own saves; staff see all. Used for read and delete. */
const ownRows: Access = ({ req }) => {
  const { user } = req
  if (!user) return false
  if (user.collection === 'users') return isStaff({ req } as Parameters<Access>[0])
  if (user.collection === 'customers') return { customer: { equals: user.id } }
  return false
}

/** A customer may save; staff may too. The row is forced to the saver below. */
const createRows: Access = ({ req }) => {
  const { user } = req
  if (!user) return false
  if (user.collection === 'users') return isStaff({ req } as Parameters<Access>[0])
  return user.collection === 'customers'
}

export const SavedListings: CollectionConfig = {
  slug: 'saved-listings',

  // One save per customer per listing. The toggle in app/save/route reads before
  // it writes, but two near-simultaneous saves of the same place would both find
  // nothing and both insert; this makes the second insert fail instead, so a
  // double-click cannot leave a duplicate that then needs two clicks to clear.
  indexes: [{ fields: ['customer', 'listing'], unique: true }],

  admin: {
    useAsTitle: 'id',
    defaultColumns: ['customer', 'listing', 'createdAt'],
    group: 'Customers',
    hidden: true, // Operational data, not something staff curate by hand.
  },

  access: {
    read: ownRows,
    create: createRows,
    // A save has no editable fields; there is nothing to update, only add and
    // remove. Left to admins so the door is shut rather than merely unused.
    update: isAdmin,
    delete: ownRows,
  },

  hooks: {
    beforeValidate: [
      /**
       * A save is always the saver's own. A customer create through any route
       * has `customer` forced to their own id here, so the field cannot be
       * pointed at somebody else even if the request carries a different value.
       * Staff creating on someone's behalf keep whatever they set.
       */
      ({ data, req }) => {
        if (req.user?.collection === 'customers' && data) {
          data.customer = req.user.id
        }
        return data
      },
    ],
  },

  fields: [
    {
      name: 'customer',
      type: 'relationship',
      relationTo: 'customers',
      required: true,
      index: true,
    },
    {
      name: 'listing',
      type: 'relationship',
      relationTo: 'businesses',
      required: true,
      index: true,
    },
  ],
}
