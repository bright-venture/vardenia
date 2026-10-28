import type { GlobalConfig } from 'payload'
import { isAdmin, isStaff } from '../access/index'

/**
 * The commission every venue that takes bookings pays, unless its listing says
 * otherwise (fields/commission).
 *
 * A page of its own rather than a value in code: a rate is a price, prices are
 * agreed in documents, and changing one should not need a deploy. Empty bills
 * nobody, so a fresh database never charges a venue that agreed to nothing.
 *
 * Staff can read it, because the statement they draw up uses it; only an admin
 * changes it, as with every other commercial setting.
 */
export const CommissionSettings: GlobalConfig = {
  slug: 'commission-settings',
  label: 'Commissions',
  admin: {
    group: 'Bookings',
    description:
      'Each guest who books through Vardenia and comes is billed to the venue as a percentage of what they spent. The venue enters the amount when it marks the visit, and the guest is asked roughly what they spent; where the two are more than 25% apart, the booking is flagged for the team. Statements are drawn up from Commission statements.',
  },
  access: { read: isStaff, update: isAdmin },
  fields: [
    {
      name: 'defaultRate',
      label: 'Default rate (%)',
      type: 'number',
      min: 0,
      max: 100,
      admin: {
        step: 0.5,
        description:
          'Applies to every listing that takes bookings and has no rate of its own. Empty bills nobody.',
      },
    },
  ],
}
