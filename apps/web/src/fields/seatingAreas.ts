import type { Field } from 'payload'
import { MAX_SEATING_AREAS, SEATING_SETTINGS } from '@vardenia/core'

/**
 * Restaurant seating areas (Task 8, 20 November 2026; core/seating).
 *
 * Public, managed by the owner from the partner dashboard (core
 * PARTNER_EDITABLE_FIELDS), valid on restaurants only. The admin shows it in
 * the Seating tab of a restaurant; because Payload skips the validation of a
 * field the admin hides, the restaurants-only and one-row-per-area rules are
 * hooks/guardKindFields, which runs on every save, and removing or shrinking an
 * area under upcoming bookings is refused by hooks/protectSeatingAreaBookings.
 *
 * Each row is one area: indoor or outdoor, smoking or not (the area key is
 * derived from those two, e.g. `outdoor-smoking`), and how many tables, which
 * is how many bookings may overlap in it. A restaurant without rows books
 * against the listing's single capacity, as before.
 */
export const seatingAreasField: Field = {
  name: 'seatingAreas',
  label: 'Seating areas',
  type: 'array',
  maxRows: MAX_SEATING_AREAS,
  labels: { singular: 'Seating area', plural: 'Seating areas' },
  admin: {
    description:
      'Optional. When set, guests choose an area and each area has its own number of tables; the listing capacity is then not used for new bookings. One row per area (indoor, indoor smoking, outdoor, outdoor smoking). An area with upcoming bookings cannot be removed or given fewer tables than they need.',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'setting',
          type: 'select',
          required: true,
          options: SEATING_SETTINGS.map((value) => ({
            label: value === 'indoor' ? 'Indoor' : 'Outdoor',
            value,
          })),
          admin: { width: '34%' },
        },
        {
          name: 'smoking',
          label: 'Smoking',
          type: 'checkbox',
          defaultValue: false,
          admin: { width: '33%' },
        },
        {
          name: 'tables',
          label: 'Tables',
          type: 'number',
          required: true,
          min: 1,
          validate: (value: unknown) =>
            Number.isInteger(value) && (value as number) >= 1
              ? true
              : 'The number of tables is a whole number, 1 or more.',
          admin: {
            width: '33%',
            step: 1,
            description: 'How many bookings may overlap in this area.',
          },
        },
      ],
    },
    {
      name: 'label',
      type: 'text',
      localized: true,
      maxLength: 80,
      admin: { description: 'Optional name shown to guests, e.g. "Garden terrace".' },
    },
  ],
}
