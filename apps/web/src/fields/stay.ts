import type { Field } from 'payload'
import { MAX_STAY_PACKAGES, STAY_PACKAGE_UNITS, validPrice } from '@vardenia/core'

/**
 * A guest house, sold as a whole property (Task 6, 20 November 2026).
 *
 * Two public groups on the listing, managed by the owner from the partner
 * dashboard (core PARTNER_EDITABLE_FIELDS) and valid on getaways only. The
 * admin shows them in the Stay tab of a getaway; because Payload skips the
 * validation of a field the admin hides, the getaways-only rule itself is
 * hooks/guardKindFields, which runs on every save. The price rules are core
 * quoteStay; the booking rules (one stay at a time, minimum nights, guest cap)
 * are lib/stay-booking.
 */

/** A whole number at least `min`, or empty. */
const wholeNumber =
  (min: number, message: string) =>
  (value: unknown): true | string =>
    value === null || value === undefined || (Number.isInteger(value) && (value as number) >= min)
      ? true
      : message

const money = (value: unknown): true | string => validPrice(value)

export const stayField: Field = {
  name: 'stay',
  label: 'Stay prices',
  type: 'group',
  admin: {
    description:
      'A guest house is booked as a whole property: one stay at a time (the listing capacity is 1), for nights. Prices in USD. Only for Getaways.',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'nightlyPrice',
          label: 'Price per night (USD)',
          type: 'number',
          min: 0,
          validate: money,
          admin: { width: '50%', step: 0.01, description: 'For the whole property.' },
        },
        {
          name: 'extraGuestFee',
          label: 'Extra guest fee (USD)',
          type: 'number',
          min: 0,
          defaultValue: 0,
          validate: money,
          admin: {
            width: '50%',
            step: 0.01,
            description: 'Per guest above the included number, per night.',
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'includedGuests',
          label: 'Guests included',
          type: 'number',
          min: 1,
          validate: wholeNumber(1, 'The number of guests included is a whole number, 1 or more.'),
          admin: {
            width: '33%',
            step: 1,
            description: 'How many guests the nightly price covers.',
          },
        },
        {
          name: 'maxGuests',
          label: 'Most guests',
          type: 'number',
          min: 1,
          validate: (
            value: unknown,
            { siblingData }: { siblingData?: Record<string, unknown> },
          ) => {
            if (value === null || value === undefined) return true
            if (!Number.isInteger(value) || (value as number) < 1) {
              return 'The most guests is a whole number, 1 or more.'
            }
            const included = siblingData?.includedGuests
            return typeof included === 'number' && (value as number) < included
              ? 'The most guests cannot be below the number of guests included.'
              : true
          },
          admin: {
            width: '33%',
            step: 1,
            description: 'The hard limit. Leave empty for none.',
          },
        },
        {
          name: 'minNights',
          label: 'Minimum nights',
          type: 'number',
          min: 1,
          defaultValue: 1,
          validate: wholeNumber(1, 'The minimum nights is a whole number, 1 or more.'),
          admin: { width: '34%', step: 1 },
        },
      ],
    },
    {
      name: 'childrenCountAsGuests',
      label: 'Children count as guests',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'On: children count toward the guests included and the most guests. Off: only adults count.',
      },
    },
    {
      name: 'packages',
      label: 'Packages',
      type: 'array',
      maxRows: MAX_STAY_PACKAGES,
      labels: { singular: 'Package', plural: 'Packages' },
      admin: {
        description:
          'Optional offers that replace the nightly price, e.g. "Weekend with breakfast". The extra guest fee still applies. Up to 10.',
      },
      fields: [
        { name: 'label', type: 'text', required: true, localized: true, maxLength: 120 },
        { name: 'description', type: 'textarea', localized: true, maxLength: 1000 },
        {
          type: 'row',
          fields: [
            {
              name: 'price',
              label: 'Price (USD)',
              type: 'number',
              required: true,
              min: 0,
              validate: (value: unknown) =>
                value === null || value === undefined ? 'Give the package a price.' : money(value),
              admin: { width: '34%', step: 0.01 },
            },
            {
              name: 'unit',
              type: 'select',
              required: true,
              defaultValue: 'per-stay',
              options: STAY_PACKAGE_UNITS.map((value) => ({
                value,
                label:
                  value === 'per-night'
                    ? 'Per night'
                    : value === 'per-stay'
                      ? 'Per stay'
                      : 'Per person per night',
              })),
              admin: { width: '33%' },
            },
            {
              name: 'active',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '33%', description: 'Off hides it from guests.' },
            },
          ],
        },
      ],
    },
  ],
}

const FEATURE_LABELS = [
  ['musicAllowed', 'Music allowed'],
  ['eventsHosted', 'Events hosted'],
  ['partiesAllowed', 'Parties allowed'],
  ['gardenAccess', 'Garden access'],
  ['barbecue', 'Barbecue'],
  ['pool', 'Pool'],
] as const

export const featuresField: Field = {
  name: 'features',
  label: 'Guest house features',
  type: 'group',
  admin: { description: 'Optional. Tick what the property offers. Only for Getaways.' },
  fields: [
    {
      type: 'row',
      fields: FEATURE_LABELS.map(([name, label]) => ({
        name,
        label,
        type: 'checkbox' as const,
      })),
    },
  ],
}
