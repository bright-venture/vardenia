import type { Field } from 'payload'
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
          'Off means the listing shows contact details only. Nothing else here applies until this is on.',
      },
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
          'How many bookings may overlap at once - tables, rooms, seats. This is enforced in the database, not just here.',
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
  ],
}
