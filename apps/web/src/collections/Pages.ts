import type { CollectionConfig } from 'payload'
import { isStaff, publishedOrStaff } from '../access/index'
import { slugField } from '../fields/slug'
import { seoField } from '../fields/seo'

/** Static marketing pages: About, Advertise, Contact, Privacy, Terms. */
export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: { useAsTitle: 'title', group: 'Content' },
  versions: { drafts: true },
  access: {
    read: publishedOrStaff,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    slugField('title'),
    { name: 'body', type: 'richText', localized: true },
    seoField,
  ],
}
