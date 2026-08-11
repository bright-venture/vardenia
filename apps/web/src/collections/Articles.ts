import type { CollectionConfig } from 'payload'
import { isStaff, publishedOrStaff } from '../access/index'
import { slugField } from '../fields/slug'
import { seoField } from '../fields/seo'
import { categoryOptions, governorateOptions } from './options'

/**
 * Editorial. The same document serves the website and the print layout - the
 * `print` group carries the issue and page range so the digital archive knows
 * which physical page a story ran on, which is what makes the QR-to-story link
 * meaningful.
 */
export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'kind', 'publishedAt', '_status'],
    group: 'Content',
  },
  versions: { drafts: true, maxPerDoc: 50 },
  access: {
    read: publishedOrStaff,
    create: isStaff,
    update: isStaff,

    delete: isStaff,
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    slugField('title'),
    { name: 'excerpt', type: 'textarea', localized: true, maxLength: 280 },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'feature',
      options: [
        { label: 'Feature', value: 'feature' },
        { label: 'Destination guide', value: 'guide' },
        { label: 'Interview', value: 'interview' },
        { label: 'Itinerary', value: 'itinerary' },
        { label: 'News', value: 'news' },
        { label: 'Sponsored', value: 'sponsored' },
      ],
    },
    {
      name: 'sponsoredBy',
      type: 'relationship',
      relationTo: 'businesses',
      admin: {
        condition: (data) => data?.kind === 'sponsored',
        description: 'Renders a mandatory "Paid partnership" label. Not optional - legally.',
      },
    },
    { name: 'heroImage', type: 'upload', relationTo: 'media', required: true },
    { name: 'body', type: 'richText', localized: true },
    {
      name: 'featuredBusinesses',
      type: 'relationship',
      relationTo: 'businesses',
      hasMany: true,
      admin: { description: 'Renders as linked cards, and drives "as seen in" on the listing.' },
    },
    { name: 'category', type: 'select', options: categoryOptions },
    { name: 'governorate', type: 'select', options: governorateOptions },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      admin: { position: 'sidebar' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'print',
      type: 'group',
      admin: { position: 'sidebar' },
      fields: [
        { name: 'issue', type: 'relationship', relationTo: 'issues' },
        { name: 'pageFrom', type: 'number' },
        { name: 'pageTo', type: 'number' },
      ],
    },
    seoField,
  ],
}
