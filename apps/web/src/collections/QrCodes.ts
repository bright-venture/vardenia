import type { CollectionConfig } from 'payload'
import { QR_PLACEMENTS, QR_TARGET_TYPES } from '@vardenia/core'
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
      name: 'offer',
      type: 'relationship',
      relationTo: 'offers',
      admin: { condition: (data) => data?.targetType === 'offer' },
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
      defaultValue: 'digital',
      options: QR_PLACEMENTS.map((value) => ({ label: value, value })),
      admin: {
        description:
          'Where this physical code lives. One code per placement - that is how we prove which placement performs.',
      },
    },
    {
      name: 'issue',
      type: 'relationship',
      relationTo: 'issues',
      admin: {
        description: 'Print issue this code appeared in.',
        condition: (data) => data?.placement === 'magazine-page',
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
