import type { CollectionConfig } from 'payload'
import { anyone, hasRole, isStaff } from '../access/index'
import { slugField } from '../fields/slug'

/** A print edition. The digital archive and the QR attribution both hang off this. */
export const Issues: CollectionConfig = {
  slug: 'issues',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'issueNumber', 'publishedAt'],
    group: 'Content',
  },
  access: { read: anyone, create: isStaff, update: isStaff, delete: hasRole('admin') },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    slugField('title'),
    { name: 'issueNumber', type: 'number', required: true, unique: true },
    { name: 'season', type: 'text', localized: true, admin: { placeholder: 'Summer 2026' } },
    { name: 'cover', type: 'upload', relationTo: 'media', required: true },
    { name: 'publishedAt', type: 'date', required: true },
    { name: 'pageCount', type: 'number', defaultValue: 100 },
    {
      name: 'printRun',
      type: 'number',
      admin: { description: 'Copies printed. Used to compute scan rate per thousand copies.' },
    },
    {
      name: 'digitalEdition',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'PDF flipbook of the full issue.' },
    },
  ],
}
