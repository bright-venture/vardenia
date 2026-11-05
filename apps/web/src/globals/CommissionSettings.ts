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
      'Each guest who books through Vardenia and comes is billed to the venue as a percentage of what they spent. The venue enters the amount when it marks the visit, and the guest is asked roughly what they spent; the guest can also send a photo of the receipt, whose total is billed first. Where the amount the venue entered is far from the receipt, or from what the guest says, the booking is flagged for the team. Statements are drawn up from Commission statements.',
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
    {
      /**
       * For receipts in pounds. Commissions are billed in dollars and the
       * receipt's total comes first (core/billableAmount), so a receipt in
       * pounds needs a rate to count. Applied when the receipt arrives, so a
       * later change does not reprice a visit already paid.
       */
      name: 'poundsPerDollar',
      label: 'Lebanese pounds per dollar',
      type: 'number',
      min: 0,
      admin: {
        step: 500,
        description:
          "Used to read a guest's receipt in LBP as dollars, at the rate on the day it arrives. Empty: receipts in LBP are not used for billing, and the venue's amount is billed instead.",
      },
    },
  ],
}
