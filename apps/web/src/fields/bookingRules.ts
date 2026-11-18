import type { Field } from 'payload'
import { canHaveRoomTypes, canTakeBookings } from '@vardenia/core'
import { isStaffFieldLevel } from '../access/index'

/**
 * How a listing takes bookings.
 *
 * Staff-managed, like everything else about how a listing behaves. An owner
 * manages their bookings - confirming, cancelling, marking a no-show - but not
 * the rules those bookings are judged against. Capacity is the reason: it is the
 * number the availability check and the database trigger both read, so an owner
 * able to raise it could accept more covers than the room holds and the only
 * evidence would be a full restaurant and an angry customer.
 *
 * If that turns out to be too strict once real venues are using it, opening up
 * `capacity` and `maxPartySize` is a field-level access change and nothing else.
 * Starting closed is the direction that fails safely.
 *
 * Every value here has a default in lib/availability, so a listing with bookings
 * switched on and nothing else filled in behaves sensibly rather than refusing
 * everything.
 */
export const bookingRulesField: Field = {
  name: 'booking',
  type: 'group',
  access: { create: isStaffFieldLevel, update: isStaffFieldLevel },
  admin: {
    description: 'Only fill this in once the business has agreed to take bookings through us.',
  },
  fields: [
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Off means the listing shows contact details only. Nothing else here applies until this is on. Only hotels, getaways, restaurants, guided tours, activities, event planners, car rental, airport transfers and private drivers can take bookings.',
      },
      /*
       * Pools, cafes, nightlife, festivals, historic sites, gyms and malls are
       * listed and advertised, never booked. Refused here rather than hidden, so
       * a listing that moves from Restaurants to Cafes is told why its booking
       * switch no longer saves instead of silently losing it. See core/taxonomy.
       */
      validate: (value: unknown, { data }: { data: Partial<{ subcategories: string[] }> }) =>
        value !== true || canTakeBookings(data?.subcategories ?? [])
          ? true
          : 'This kind of place is listed only and cannot take bookings. Choose a bookable kind of place first, or turn booking off.',
    },

    {
      name: 'autoConfirm',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        condition: (_, siblings) => siblings?.enabled === true,
        description:
          'On, a booking is confirmed immediately. Off, it arrives as a request for the business to accept. A restaurant with free tables wants this on; a wedding venue does not.',
      },
    },

    {
      name: 'capacity',
      type: 'number',
      min: 1,
      defaultValue: 1,
      admin: {
        condition: (_, siblings) => siblings?.enabled === true,
        description:
          'How many bookings may overlap at once - tables, seats. Enforced in the database. Not used for a hotel or getaway with room types: there, each room type has its own rooms and open dates (Rooms tab).',
      },
    },

    {
      type: 'row',
      fields: [
        {
          name: 'minPartySize',
          type: 'number',
          min: 1,
          defaultValue: 1,
          admin: {
            width: '50%',
            condition: (_, siblings) => siblings?.enabled === true,
          },
        },
        {
          name: 'maxPartySize',
          type: 'number',
          min: 1,
          defaultValue: 8,
          admin: {
            width: '50%',
            condition: (_, siblings) => siblings?.enabled === true,
          },
        },
      ],
    },

    {
      type: 'row',
      fields: [
        {
          name: 'leadTimeMinutes',
          type: 'number',
          min: 0,
          defaultValue: 60,
          admin: {
            width: '50%',
            condition: (_, siblings) => siblings?.enabled === true,
            description: 'Minimum notice. 0 means walk-ins welcome.',
          },
        },
        {
          name: 'maxAdvanceDays',
          type: 'number',
          min: 1,
          defaultValue: 180,
          admin: {
            width: '50%',
            condition: (_, siblings) => siblings?.enabled === true,
            description: 'How far ahead the calendar is open.',
          },
        },
      ],
    },

    {
      type: 'row',
      fields: [
        {
          name: 'minDurationMinutes',
          type: 'number',
          min: 1,
          defaultValue: 60,
          admin: {
            width: '50%',
            condition: (_, siblings) => siblings?.enabled === true,
            description: 'A dinner sitting, or one night for a hotel (1440).',
          },
        },
        {
          name: 'maxDurationMinutes',
          type: 'number',
          min: 1,
          defaultValue: 240,
          admin: {
            width: '50%',
            condition: (_, siblings) => siblings?.enabled === true,
            description: 'Longest single booking. A hotel needs this in the thousands.',
          },
        },
      ],
    },

    /**
     * Room or unit types, for a stay.
     *
     * Shown only when the minimum duration marks this as a stay rather than a
     * sitting (>= one day) - the same threshold booking-form uses to decide the
     * form's shape, so a restaurant never sees a room-types field. Presentation
     * only: the guest picks one and it is recorded on the booking for the venue
     * to see, but it does not have its own inventory - capacity stays the single
     * number above, enforced by the database trigger. Leave empty for a place
     * with one kind of room.
     */
    {
      name: 'roomTypes',
      label: 'Simple room labels (old)',
      type: 'array',
      // Hidden and unused since 18 November 2026: room types replace them
      // (the Rooms tab). Kept so no saved data is lost.
      hidden: true,
      labels: { singular: 'Room label', plural: 'Room labels' },
      admin: {
        condition: (_, siblings) =>
          siblings?.enabled === true && Number(siblings?.minDurationMinutes ?? 0) >= 1440,
        description:
          'Old: names only, with no photos, rooms or availability. Use the Rooms tab instead. These show on the page only while the listing has no room types.',
      },
      fields: [
        { name: 'label', type: 'text', required: true },
        {
          name: 'price',
          type: 'number',
          min: 0,
          admin: {
            description: 'Nightly price "from", in USD. Optional; shown as "from $X".',
          },
        },
        {
          name: 'note',
          type: 'text',
          admin: { description: 'Optional, e.g. "Sleeps 2, sea view".' },
        },
      ],
    },

    {
      /**
       * When a stay starts and ends on the day (17 November 2026).
       *
       * Hotels use check-in and check-out times, not opening hours: a room
       * booking runs from check-in on the first day to check-out on the last,
       * and its nights are what count against the room types. Only read for a
       * listing that has room types; every other stay keeps 15:00 and 11:00
       * (lib/booking-form CHECK_IN and CHECK_OUT).
       */
      type: 'row',
      admin: {
        // For hotels and getaways (18 November 2026), and any listing that
        // sells nights. Partners can also set these from their Rooms tab.
        condition: (data, siblings) =>
          siblings?.enabled === true &&
          (canHaveRoomTypes((data?.subcategories as string[]) ?? []) ||
            Number(siblings?.minDurationMinutes ?? 0) >= 1440),
      },
      fields: [
        {
          name: 'checkInTime',
          label: 'Check-in from',
          type: 'text',
          defaultValue: '15:00',
          validate: (value: unknown) =>
            !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))
              ? true
              : 'Use 24-hour time, like 15:00.',
        },
        {
          name: 'checkOutTime',
          label: 'Check-out until',
          type: 'text',
          defaultValue: '11:00',
          validate: (value: unknown) =>
            !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))
              ? true
              : 'Use 24-hour time, like 11:00.',
        },
      ],
    },

    {
      /**
       * The cancellation terms, in the customer's words. Localised because it is
       * prose a customer reads before booking, so it needs to be sayable in
       * Arabic; untranslated locales fall back to English, like every other
       * localised field. It is shown, not enforced - there is no payment or
       * refund in the system yet - so it is free text rather than a notice
       * window and a percentage. When refunds are built (see the payment ADR),
       * a structured policy can join this.
       */
      name: 'cancellationPolicy',
      type: 'textarea',
      localized: true,
      admin: {
        condition: (_, siblings) => siblings?.enabled === true,
        description:
          'Shown to the customer before they book, e.g. "Free cancellation up to 48 hours before". Leave empty to show nothing.',
      },
    },
  ],
}
