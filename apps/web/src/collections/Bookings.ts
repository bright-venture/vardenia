import type { Access, CollectionConfig, FieldAccess, Where } from 'payload'
import {
  ATTENDANCE_VERDICTS,
  BOOKING_STATUSES,
  GUEST_ANSWERS,
  generateBookingReference,
} from '@vardenia/core'
import { LOCALES, LOCALE_META } from '@vardenia/i18n'
import {
  BUSINESS_USER_COLLECTION,
  isAdmin,
  isStaff,
  isStaffFieldLevel,
  isStaffOrOwnerFieldLevel,
  isStaffUser,
  fixedOnceCreated,
  ownedBusinessIds,
} from '../access/index'
import { guardBookingWrite } from '../hooks/guardBookingWrite'
import { notifyBookingStatus } from '../hooks/notifyBookingStatus'
import { alertAttendanceMismatch } from '../hooks/alertAttendanceMismatch'
import { markAttendanceDispute } from '../hooks/markAttendanceDispute'
import { stampAnsweredAt } from '../hooks/stampAnsweredAt'
import { stampAmountEnteredAt } from '../hooks/stampAmountEnteredAt'

/**
 * What the guest spent: the venue gives it once, staff may correct it.
 *
 * Once, like the guest's own answer, because it is what the commission is
 * taken of: a venue that could lower it after the guest has said otherwise
 * would settle every dispute in its own favour. A venue that typed it wrong
 * asks the team.
 */
const venueOnceOrStaff: FieldAccess = ({ req, doc }) => {
  if (isStaffUser(req.user)) return true
  if ((req.user as { collection?: string } | null)?.collection !== BUSINESS_USER_COLLECTION) {
    return false
  }
  const stored = (doc as { amount?: unknown } | undefined)?.amount
  return stored === null || stored === undefined
}

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
    // Can be grouped by listing in the list view (Group by, then Business), so
    // each listing's entries sit together. See the links on the admin home.
    groupBy: true,
    // Opens on one folder per listing; a folder is the normal list, filtered
    // to that listing. See components/admin/FolderListView.
    components: {
      views: { list: { Component: '/components/admin/FolderListView#FolderListView' } },
    },
    useAsTitle: 'reference',
    defaultColumns: ['reference', 'business', 'start', 'partySize', 'status', 'attendanceDisputed'],
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
    // When the venue first answered; see hooks/stampAnsweredAt.
    beforeChange: [stampAnsweredAt, stampAmountEnteredAt, markAttendanceDispute],
    /**
     * Tells the customer when the business accepts or declines. On the
     * collection rather than in the partner dashboard, because a booking is
     * answered from there, from the admin panel, and by staff on the phone -
     * and a notification wired to one button does not fire from the others.
     */
    afterChange: [notifyBookingStatus, alertAttendanceMismatch],
  },

  fields: [
    {
      /**
       * The booking as staff read it, with only the moves allowed from its
       * saved status. Nothing stored: the buttons set status (and the decline
       * reason). See components/admin/BookingCard.
       */
      name: 'bookingCard',
      type: 'ui',
      admin: { components: { Field: '/components/admin/BookingCard#BookingCard' } },
    },
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
      label: 'Listing',
      type: 'relationship',
      relationTo: 'businesses',
      required: true,
      index: true,
      // guardBookingWrite refuses a move too; this is what the admin shows.
      access: { update: fixedOnceCreated },
    },

    {
      name: 'customer',
      type: 'relationship',
      relationTo: 'customers',
      required: true,
      index: true,
      access: { update: fixedOnceCreated },
    },

    {
      type: 'row',
      fields: [
        /*
         * Staff only once the booking exists. A guest or venue may update the
         * booking, to cancel or answer it, and without this the same request
         * could move it to another night. Staff moving one is re-checked for
         * availability in guardBookingWrite.
         */
        {
          name: 'start',
          type: 'date',
          required: true,
          index: true,
          access: { update: isStaffFieldLevel },
          // Day and time: a day-only picker showed 08/18/2026 for a 17:00
          // table, and changing the day could lose the time.
          admin: {
            width: '50%',
            date: {
              pickerAppearance: 'dayAndTime',
              timeFormat: 'HH:mm',
              displayFormat: 'd MMM yyyy, HH:mm',
            },
          },
        },
        {
          name: 'end',
          type: 'date',
          required: true,
          access: { update: isStaffFieldLevel },
          admin: {
            width: '50%',
            date: {
              pickerAppearance: 'dayAndTime',
              timeFormat: 'HH:mm',
              displayFormat: 'd MMM yyyy, HH:mm',
            },
          },
        },
      ],
    },

    {
      name: 'partySize',
      label: 'Party',
      type: 'number',
      required: true,
      min: 1,
      defaultValue: 2,
      // The fee is charged per guest for some venues. Staff only, re-checked.
      access: { update: isStaffFieldLevel },
    },

    {
      /**
       * The room or unit type a stay asked for, as a label. Empty for a table
       * booking, and for a stay at a place that offers only one kind of room.
       * It is a note the venue reads, not a separate capacity - see the room
       * types on the listing's booking rules.
       */
      name: 'roomType',
      type: 'text',
      access: { update: isStaffFieldLevel },
      admin: {
        description: 'The room or unit type requested, for a stay. Empty for a table booking.',
      },
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
      admin: {
        position: 'sidebar',
        description: 'Change it with the buttons on the booking, then Save.',
      },
    },

    {
      name: 'notes',
      type: 'textarea',
      // The guest's own words at booking time. Account deletion clears it with
      // overrideAccess; nobody edits it afterwards.
      access: { update: fixedOnceCreated },
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
    /*
     * Every UI language, built from the list rather than written out. It was
     * English and Arabic only, so a booking made in French could not be stored
     * - the request was refused before it got here, and the column's enum would
     * have refused it if it had not been. Adding a value to this list is a
     * migration (the enum), which is also why it is derived: a language added to
     * @vardenia/i18n arrives here in the same change. See the migration
     * 20260923_booking_locales.
     */
    {
      name: 'locale',
      type: 'select',
      defaultValue: 'en',
      access: { update: isStaffFieldLevel },
      options: LOCALES.map((code) => ({ label: LOCALE_META[code].label, value: code })),
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
      /**
       * When the venue first confirmed or declined this request. Set by the
       * server only (hooks/stampAnsweredAt), and what "usually answers within
       * X hours" on the listing is worked out from.
       */
      name: 'answeredAt',
      label: 'Answered at',
      type: 'date',
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
        description: 'When the venue first confirmed or declined it. Set automatically.',
      },
    },
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

    /**
     * The booking form's id for one attempt, so a retry after a lost answer
     * returns this booking instead of making a second (lib/booking-service).
     * Unique in the database, which is what holds when two copies of the same
     * request arrive together. Never shown, and fixed once written.
     */
    {
      name: 'requestId',
      type: 'text',
      unique: true,
      access: { read: isStaffFieldLevel, update: fixedOnceCreated },
      admin: { hidden: true },
    },

    /**
     * Did the guest come, in the guest's own words (see core/attendance).
     *
     * Asked by email a couple of hours after the visit, and from the passport.
     * Written only by the server with access overridden (lib/attendance), so
     * neither the guest editing their booking nor the venue can set it here.
     * Staff may correct one, which is why update is staff and not nobody.
     */
    {
      type: 'collapsible',
      label: 'Did the guest come?',
      admin: { position: 'sidebar', initCollapsed: false },
      fields: [
        {
          name: 'guestAnswer',
          label: 'The guest says',
          type: 'select',
          index: true,
          options: GUEST_ANSWERS.map((value) => ({
            label: value === 'came' ? 'I came' : 'I did not come',
            value,
          })),
          access: { create: () => false, update: isStaffFieldLevel },
          admin: { description: 'Their answer to "Did you go?". Empty until they answer.' },
        },
        {
          name: 'guestAnsweredAt',
          label: 'Answered on',
          type: 'date',
          access: { create: () => false, update: () => false },
          admin: {
            readOnly: true,
            date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
          },
        },
        {
          name: 'attendanceAskedAt',
          label: 'Asked on',
          type: 'date',
          index: true,
          access: { read: isStaffFieldLevel, create: () => false, update: () => false },
          admin: {
            readOnly: true,
            date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
          },
        },
        {
          /**
           * True while the guest and the venue disagree and nobody has
           * decided. Set by hooks/markAttendanceDispute on every save, never
           * by hand: it is what the admin home and the bookings list filter on.
           */
          name: 'attendanceDisputed',
          label: 'Disputed',
          type: 'checkbox',
          defaultValue: false,
          index: true,
          access: { create: () => false, update: () => false },
          admin: {
            readOnly: true,
            description: 'The guest and the venue disagree. Settle it with "Team decision" below.',
          },
        },
        {
          /**
           * The team's decision where the guest and the venue disagreed. It is
           * what billing and the passport follow from then on: "the guest is
           * right" bills a visit the venue marked a no-show, and stamps it.
           */
          name: 'attendanceVerdict',
          label: 'Team decision',
          type: 'select',
          options: ATTENDANCE_VERDICTS.map((value) => ({
            label: value === 'guest' ? 'The guest is right' : 'The venue is right',
            value,
          })),
          // Readable by whoever can read the booking - the guest's passport
          // follows it - and set by staff only.
          access: { create: () => false, update: isStaffFieldLevel },
          admin: {
            description:
              'Only when the guest and the venue disagree, on the visit or on what was spent. "The guest is right" bills the visit on the amount the guest gave, and gives the guest the stamp.',
          },
        },
      ],
    },

    /**
     * What the guest spent, which the commission is taken of (core/booking-fees).
     *
     * The venue enters it when it marks the visit as done; the guest gives a
     * rough figure with their "Did you go?" answer. Where the two are far
     * apart the booking is disputed like any other disagreement above.
     * Neither figure is shown to the guest.
     */
    {
      type: 'collapsible',
      label: 'What the guest spent',
      admin: { position: 'sidebar', initCollapsed: false },
      fields: [
        {
          name: 'amount',
          label: 'Amount, as the venue says (USD)',
          type: 'number',
          min: 0,
          access: {
            read: isStaffOrOwnerFieldLevel,
            create: isStaffFieldLevel,
            update: venueOnceOrStaff,
          },
          admin: {
            step: 0.01,
            description:
              'The bill or the stay, entered by the venue when it marks the visit as done. The commission is taken of this.',
          },
        },
        {
          name: 'amountEnteredAt',
          label: 'Entered on',
          type: 'date',
          access: {
            read: isStaffOrOwnerFieldLevel,
            create: () => false,
            update: () => false,
          },
          admin: {
            readOnly: true,
            date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
          },
        },
        {
          name: 'guestAmount',
          label: 'Amount, as the guest says (USD)',
          type: 'number',
          min: 0,
          access: { read: isStaffFieldLevel, create: () => false, update: isStaffFieldLevel },
          admin: {
            step: 0.01,
            description:
              'Roughly, from the answer the guest gave to "Did you go?". Used when the venue gave none, or when the team sides with the guest.',
          },
        },
      ],
    },
  ],
}
