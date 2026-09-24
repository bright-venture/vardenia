/**
 * What a venue pays for each guest who booked through Vardenia and came.
 *
 * Set by staff from the agreement the venue signed, and read only by staff and
 * by the monthly statement. A listing with nothing here is never billed: there
 * is no default, because a default amount would be charged to somebody who never
 * agreed to it. See packages/core/src/booking-fees for the arithmetic.
 *
 * Staff-only at the field level, like the contract dates beside it. The venue
 * sees what it is charged on its statements, line by line; the settings
 * themselves are ours.
 */

import type { GroupField } from 'payload'
import { FEE_UNITS, type FeeUnit } from '@vardenia/core'
import { isAdminFieldLevel, isStaffFieldLevel } from '../access/index'

const UNIT_LABELS: Record<FeeUnit, string> = {
  guest: 'Per guest who came (restaurants, activities)',
  night: 'Per night stayed (hotels, guesthouses)',
  booking: 'Per booking',
}

export const bookingFeeField: GroupField = {
  name: 'bookingFee',
  type: 'group',
  label: 'Booking fee',
  access: { read: isStaffFieldLevel, update: isAdminFieldLevel },
  admin: {
    description:
      'From the agreement the venue signed. Leave the unit empty and the venue is never billed. No-shows and cancellations are never charged.',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'unit',
          type: 'select',
          options: FEE_UNITS.map((unit) => ({ label: UNIT_LABELS[unit], value: unit })),
          admin: { width: '50%' },
        },
        {
          name: 'amount',
          type: 'number',
          min: 0,
          admin: { width: '25%', description: 'US dollars per unit.', step: 0.5 },
        },
        {
          name: 'cap',
          type: 'number',
          min: 0,
          admin: {
            width: '25%',
            description: 'Most one booking can cost, in US dollars. Empty for no cap.',
            step: 0.5,
          },
        },
      ],
    },
    {
      name: 'waivedUntil',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayOnly' },
        description:
          'Launch offer: bookings on or before this day are not billed. Empty when there is none.',
      },
    },
  ],
}
