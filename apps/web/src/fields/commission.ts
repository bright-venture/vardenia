/**
 * What a venue pays, as a share of what each guest who booked through Vardenia
 * and came spent there.
 *
 * Empty means the default rate on the Commissions page applies, which is how
 * almost every listing is meant to be: one rate for everybody, set in one
 * place. A rate here is for a venue that signed something different, 0
 * included. Read only by staff and by the monthly statement; see
 * packages/core/src/booking-fees for the arithmetic.
 *
 * Staff-only at the field level, like the contract dates beside it. The venue
 * sees what it is charged on its statements, line by line; the settings
 * themselves are ours.
 */

import type { GroupField } from 'payload'
import { isAdminFieldLevel, isStaffFieldLevel } from '../access/index'

export const commissionField: GroupField = {
  name: 'commission',
  type: 'group',
  label: 'Commission',
  // Admin sets the price, on a new listing as on an existing one. Staff creating
  // a listing leave it empty, which bills the default rate.
  access: { read: isStaffFieldLevel, create: isAdminFieldLevel, update: isAdminFieldLevel },
  admin: {
    description:
      'A percentage of what each guest who came spent, as entered by the venue. Leave the rate empty to use the default on the Commissions page. No-shows and cancellations are never charged.',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'rate',
          label: 'Rate (%)',
          type: 'number',
          min: 0,
          max: 100,
          admin: {
            width: '50%',
            step: 0.5,
            description: 'Only if this venue agreed a different rate. 0 bills nothing.',
          },
        },
        {
          name: 'waivedUntil',
          type: 'date',
          admin: {
            width: '50%',
            date: { pickerAppearance: 'dayOnly' },
            description:
              'Launch offer: bookings on or before this day are not billed. Empty when there is none.',
          },
        },
      ],
    },
  ],
}
