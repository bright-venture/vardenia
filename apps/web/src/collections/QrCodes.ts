import type { CollectionConfig } from 'payload'
import { DEFAULT_PLACEMENT, QR_PLACEMENTS, QR_TARGET_TYPES } from '@vardenia/core'
import { isAdmin, isStaff } from '../access/index'
import { protectPrintedCodes } from '../hooks/protectPrintedCodes'

/**
 * A printed code is permanent; its destination is not.
 *
 * `code` is immutable after creation (enforced below). Everything else can be
 * re-pointed, which is what makes the print product durable: a restaurant that
 * rebrands keeps its code, and the 20,000 magazines already in circulation keep
 * working.
 */
export const QrCodes: CollectionConfig = {
  slug: 'qr-codes',
  // Payload titles a collection from its slug, which gives "Qr Codes".
  labels: { singular: 'QR Code', plural: 'QR Codes' },
  admin: {
    useAsTitle: 'code',
    defaultColumns: ['code', 'targetType', 'placement', 'scanCount', 'active'],
    group: 'Directory',
  },
  access: {
    read: isStaff,
    create: isStaff,
    update: isStaff,
    delete: isAdmin,
  },
  hooks: {
    beforeDelete: [protectPrintedCodes],
  },
  fields: [
    {
      name: 'printable',
      type: 'ui',
      admin: { components: { Field: '/components/admin/QrPreview#QrPreview' } },
    },
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true, description: 'Immutable. This is what gets printed.' },
      hooks: {
        beforeChange: [
          ({ value, originalDoc, operation }) => {
            if (operation === 'update' && originalDoc?.code) return originalDoc.code
            return value
          },
        ],
      },
    },
    {
      name: 'targetType',
      type: 'select',
      required: true,
      defaultValue: 'business',
      options: QR_TARGET_TYPES.map((value) => ({ label: value, value })),
    },
    {
      name: 'business',
      type: 'relationship',
      relationTo: 'businesses',
      index: true,
      admin: { condition: (data) => data?.targetType === 'business' },
    },
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'articles',
      admin: { condition: (data) => data?.targetType === 'article' },
    },
    {
      name: 'externalUrl',
      type: 'text',
      admin: { condition: (data) => data?.targetType === 'external' },
    },
    {
      name: 'placement',
      type: 'select',
      required: true,
      defaultValue: DEFAULT_PLACEMENT,
      options: QR_PLACEMENTS.map((value) => ({ label: value, value })),
      admin: {
        description:
          'Codes are printed in the magazine and nowhere else, so leave this on magazine-page. The other values are surfaces we have not shipped; picking one now records something that is not true.',
      },
    },
    {
      name: 'issue',
      type: 'relationship',
      relationTo: 'issues',
      admin: {
        // Previously hidden unless placement was magazine-page, which combined
        // with a 'digital' default meant the field never appeared at all - so no
        // code was ever tied to an issue, and the print sheet had nothing to
        // filter on. It is the most important field here; it is always shown.
        description:
          'Which printed issue carries this code. Set it before the issue goes to press: it is what the print sheet filters on, and what marks the code as permanent.',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Inactive codes land on a "this listing has moved" page rather than 404 - never delete a printed code.',
      },
    },
    {
      name: 'scanCount',
      type: 'number',
      defaultValue: 0,
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Denormalised running total. Detailed breakdown lives in Scan Events.',
      },
    },
  ],
}
