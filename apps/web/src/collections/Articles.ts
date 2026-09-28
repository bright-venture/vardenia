import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
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
/**
 * A published article gets a date. The magazine lists and the article page
 * both read publishedAt, and an article published without one had no date to
 * show or sort by. Set to the moment it is first published; a date staff typed
 * is kept.
 */
const datePublished: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (data?._status === 'published' && !data.publishedAt && !originalDoc?.publishedAt) {
    data.publishedAt = new Date().toISOString()
  }
  return data
}

/** A printed page range that reads forwards. Empty is fine. */
export const pageRange = (
  value: unknown,
  { siblingData }: { siblingData?: { pageFrom?: unknown } },
) => {
  const from = Number(siblingData?.pageFrom)
  const to = Number(value)
  if (!value || !siblingData?.pageFrom) return true
  return to >= from ? true : 'The last page cannot come before the first.'
}

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'kind', 'publishedAt', '_status'],
    group: 'Magazine',
  },
  versions: { drafts: true, maxPerDoc: 50 },
  hooks: { beforeChange: [datePublished] },
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
      // The label is a legal requirement, so the sponsor is too: a sponsored
      // article that names nobody reads as a paid one with the payer hidden.
      validate: (value: unknown, { data }: { data?: { kind?: string } }) =>
        data?.kind !== 'sponsored' || value ? true : 'Name the listing that paid for this article.',
      admin: {
        condition: (data) => data?.kind === 'sponsored',
        description: 'Shown with a "Paid partnership" label. Required for a sponsored article.',
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
      label: 'Published on',
      type: 'date',
      index: true,
      admin: { position: 'sidebar', description: 'Set when it is first published, if left empty.' },
    },
    {
      name: 'print',
      label: 'In print',
      type: 'group',
      admin: { position: 'sidebar' },
      fields: [
        { name: 'issue', label: 'Printed in issue', type: 'relationship', relationTo: 'issues' },
        { name: 'pageFrom', label: 'From page', type: 'number', min: 1 },
        { name: 'pageTo', label: 'To page', type: 'number', min: 1, validate: pageRange },
      ],
    },
    seoField,
  ],
}
