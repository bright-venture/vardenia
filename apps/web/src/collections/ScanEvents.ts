import type { CollectionConfig } from 'payload'
import { QR_PLACEMENTS } from '@vardenia/core'
import { isAdmin, isStaff } from '../access/index'

/**
 * Append-only scan log. This table is the evidence behind every renewal
 * conversation: "your window decal drove 1,240 scans and 300 direction taps
 * last quarter."
 *
 * Deliberately coarse. We store city and country, never precise coordinates,
 * and no device identifier - a tourism guide has no business building a
 * location history of its readers, and GDPR applies to the European audience
 * this platform is explicitly courting.
 *
 * At volume this moves to a columnar store (see docs/adr/0004). The collection
 * boundary is drawn here so that migration touches one file.
 */
export const ScanEvents: CollectionConfig = {
  slug: 'scan-events',
  admin: {
    useAsTitle: 'code',
    defaultColumns: ['code', 'scannedAt', 'placement', 'city', 'platform'],
    group: 'Analytics',
    description: 'Read-only. Written by the QR redirect endpoint.',
  },
  access: {
    read: isStaff,
    // Only the redirect route writes here, using local (server-side) API access.
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  timestamps: false,
  fields: [
    { name: 'code', type: 'text', required: true, index: true },
    {
      name: 'qrCode',
      type: 'relationship',
      relationTo: 'qr-codes',
      index: true,
    },
    {
      name: 'business',
      type: 'relationship',
      relationTo: 'businesses',
      index: true,
      admin: { description: 'Denormalised so advertiser analytics need no join.' },
    },
    { name: 'scannedAt', type: 'date', required: true, index: true },
    {
      name: 'placement',
      type: 'select',
      options: QR_PLACEMENTS.map((value) => ({ label: value, value })),
      index: true,
    },
    { name: 'city', type: 'text' },
    { name: 'country', type: 'text', index: true },
    {
      name: 'platform',
      type: 'select',
      options: ['ios', 'android', 'web', 'unknown'].map((value) => ({ label: value, value })),
    },
    {
      name: 'isDirectScan',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'False when the link was shared onward rather than scanned off a printed surface.',
      },
    },
  ],
}
