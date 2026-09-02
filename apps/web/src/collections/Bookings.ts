import type { Access, CollectionConfig, Where } from 'payload'
import { BOOKING_STATUSES, generateBookingReference } from '@vardenia/core'
import {
  isAdmin,
  isStaff,
  isStaffFieldLevel,
  isStaffOrOwnerFieldLevel,
  ownedBusinessIds,
} from '../access/index'
import { guardBookingWrite } from '../hooks/guardBookingWrite'
import { notifyBookingStatus } from '../hooks/notifyBookingStatus'

/**
 * A reservation: one customer, one business, one interval.
 *
 * Three parties can see a booking and they see different things, so the access
 * rules are the substance of this file rather than the fields.
 *
 * - staff  : everything, including internal notes.
 * - owner  : the bookings for the businesses they manage, and nothing else. No
 *            other business's bookings, and no other customer's.
 * - customer : their own bookings only.
 *
 * Every one of those is expressed as a query constraint rather than a boolean,
 * so Payload filters in the database. The difference matters: a boolean rule
 * would let a customer request `/api/bookings` and learn how many bookings exist
 * from the total count even while seeing none of them.
 */

/** Bookings for the businesses this owner manages. */
const ownedBookings = (user: unknown): Where | false => {
  const owned = ownedBusinessIds(user)
  if (owned.length === 0) return false
  return { business: { in: owned } }
}

const readBookings: Access = ({ req }) => {
  const { user } = req
  if (!user) return false

  if (user.collection === 'users') return isStaff({ req } as Parameters<Access>[0])
  if (user.collection === 'business-users') return ownedBookings(user)
  if (user.collection === 'customers') return { customer: { equals: user.id } }

  return false
}

/**
 * Who may change a booking.
 *
 * Deliberately the same shape as reading. What each party may change it *to* is
 * a separate question, enforced in the guard hook: a customer may cancel, an
 * owner may confirm or mark a no-show, and neither may move a booking to a
 * different business.
 */
const updateBookings: Access = ({ req }) => {
  const { user } = req
  if (!user) return false

  if (user.collection === 'users') return isStaff({ req } as Parameters<Access>[0])
  if (user.collection === 'business-users') return ownedBookings(user)
  if (user.collection === 'customers') return { customer: { equals: user.id } }

  return false
}

/**
 * Creating is staff-only for now, for the same reason customer sign-up is.
 *
 * The public booking flow needs an endpoint of its own - one that takes an
 * availability check, a capacity-safe insert and a confirmation email as a
 * single unit. Opening this collection to `customers` before that exists would
 * let a request skip the availability check entirely, since a create through the
 * REST API carries whatever fields the caller sends.
 *
 * The guard hook runs regardless of who is creating, so the invariants hold for
 * staff too.
 */
const createBookings: Access = ({ req }) => isStaff({ req } as Parameters<Access>[0])

export const Bookings: CollectionConfig = {
  slug: 'bookings',

  admin: {
    useAsTitle: 'reference',
    defaultColumns: ['reference', 'business', 'start', 'partySize', 'status'],
    group: 'Bookings',
    listSearchableFields: ['reference'],
  },

  access: {
    read: readBookings,
    create: createBookings,
    update: updateBookings,
    // Never deleted in the ordinary course of things. A cancelled booking is
    // part of the record - it is what a dispute about a no-show fee is argued
    // from - so cancelling sets a status rather than removing a row.
    delete: isAdmin,
  },

  hooks: {
    beforeValidate: [guardBookingWrite],
    /**
     * Tells the customer when the business accepts or declines. On the
     * collection rather than in the partner dashboard, because a booking is
     * answered from there, from the admin panel, and by staff on the phone -
     * and a notification wired to one button does not fire from the others.
     */
    afterChange: [notifyBookingStatus],
  },

  fields: [
    {
      name: 'reference',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'What the customer quotes. Generated, never edited.',
      },
      hooks: {
        beforeValidate: [
          ({ value, operation }) => {
            if (operation === 'create' && !value) return generateBookingReference()
            return value
          },
        ],
      },
    },

    {
      name: 'business',
      type: 'relationship',
      relationTo: 'businesses',
      required: true,
      index: true,
    },

    {
      name: 'customer',
      type: 'relationship',
      relationTo: 'customers',
      required: true,
      index: true,
    },

    {
      type: 'row',
      fields: [
        { name: 'start', type: 'date', required: true, index: true, admin: { width: '50%' } },
        { name: 'end', type: 'date', required: true, admin: { width: '50%' } },
      ],
    },

    {
      name: 'partySize',
      type: 'number',
      required: true,
      min: 1,
      defaultValue: 2,
    },

    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'pending',
      options: BOOKING_STATUSES.map((status) => ({
        label: status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' '),
        value: status,
      })),
    },

    {
      name: 'notes',
      type: 'textarea',
      admin: {
        description: 'What the customer told us - a dietary requirement, an anniversary.',
      },
    },

    /**
     * Which language to write to this customer in.
     *
     * Captured from the page they booked on, because that is the only moment we
     * ever know it. The confirmation email had it from the request and every
     * message after that - the business accepting, the business cancelling - is
     * sent from a hook with no request behind it, so without this the whole
     * follow-up conversation would default to English for an Arabic reader.
     *
     * On the booking rather than on the customer: it is a fact about how they
     * arrived, and a Beirut household that reads the site in Arabic may well have
     * a member who books in English. The most recent booking is the better guess
     * either way.
     */
    {
      name: 'locale',
      type: 'select',
      defaultValue: 'en',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Arabic', value: 'ar' },
      ],
      admin: {
        description: 'The language this customer is written to in.',
        position: 'sidebar',
      },
    },

    /**
     * Why the venue turned this booking down, in their words.
     *
     * A decline used to arrive as a flat "the business was not able to take this
     * booking" and nothing else, which reads as a door closing. "We are closed
     * that week" or "we only have the 21:30 sitting left" is the same refusal
     * and an entirely different message - the second one tells the guest what to
     * try instead.
     *
     * Optional, always. A venue answering thirty requests at the end of a shift
     * must not be made to justify each one, and a required field would only
     * teach people to type a full stop.
     *
     * # Who may write it
     *
     * The venue and staff, never the customer, even though a customer may update
     * this document to cancel their own booking. Field-level access is the only
     * thing that separates those two: without it, a customer's PATCH could set
     * the sentence we attribute to the restaurant. They may read it - it is a
     * message written to them - and it reaches them by email either way.
     *
     * Capped rather than a textarea. It goes into an email as one line, and a
     * limit is what keeps it that.
     */
    {
      name: 'declineReason',
      type: 'text',
      maxLength: 200,
      access: { update: isStaffOrOwnerFieldLevel },
      admin: {
        description:
          'Optional. Sent to the guest when a booking is declined or called off. One line.',
      },
    },

    /**
     * Staff only, for now.
     *
     * Owners will want this once they have a dashboard - a note about a difficult
     * table is exactly the restaurant's own record - and widening it then is one
     * access function. Starting narrower is the direction that fails safely.
     *
     * What must never change is that the customer cannot read it. `access.read`
     * is the only thing that keeps a field out of an API response;
     * `admin.condition` hides it in the panel and serialises it anyway.
     */
    {
      name: 'internalNotes',
      type: 'textarea',
      access: { read: isStaffFieldLevel, update: isStaffFieldLevel },
      admin: { description: 'Not visible to the customer.' },
    },
  ],
}
