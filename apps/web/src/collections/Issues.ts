import type { CollectionConfig } from 'payload'
import { anyone, isAdmin, isStaff, isStaffFieldLevel } from '../access/index'
import { slugField } from '../fields/slug'

/** A print edition. The digital archive and the QR attribution both hang off this. */
export const Issues: CollectionConfig = {
  slug: 'issues',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'issueNumber', 'publishedAt'],
    group: 'Magazine',
  },
  access: { read: anyone, create: isStaff, update: isStaff, delete: isAdmin },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    slugField('title'),
    { name: 'issueNumber', type: 'number', required: true, unique: true },
    { name: 'season', type: 'text', localized: true, admin: { placeholder: 'Summer 2026' } },
    { name: 'cover', type: 'upload', relationTo: 'media', required: true },
    { name: 'publishedAt', type: 'date', required: true },
    { name: 'pageCount', label: 'Pages', type: 'number', defaultValue: 100, min: 1 },
    {
      name: 'printRun',
      label: 'Copies printed',
      type: 'number',
      min: 0,
      // Staff-only. Actual circulation is commercial intelligence: it is the
      // denominator in every scan-rate figure, and not a number an advertiser
      // or a competitor should be able to scrape while rates are being agreed.
      access: { read: isStaffFieldLevel },
      admin: { description: 'Copies printed. Used to compute scan rate per thousand copies.' },
    },
    {
      name: 'digitalEdition',
      label: 'Digital edition (PDF)',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'PDF flipbook of the full issue.' },
    },
  ],
}
