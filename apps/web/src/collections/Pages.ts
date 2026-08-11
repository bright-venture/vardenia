import type { CollectionConfig } from 'payload'
import { isStaff, publishedOrStaff } from '../access/index'
import { slugField } from '../fields/slug'
import { seoField } from '../fields/seo'

/**
 * Permanent website pages: About, Advertise, Contact, Privacy, Terms.
 *
 * Nothing to do with the printed pages inside an Issue. Labelled "Site Pages"
 * in the admin for exactly that reason, since "Pages" sitting next to "Issues"
 * reads as the pages of a magazine and confuses everyone once.
 *
 * The URL stays /pages/... The label is display only.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Site Page', plural: 'Site Pages' },
  admin: {
    useAsTitle: 'title',
    group: 'Content',
    description: 'Standing pages of the website. Not magazine content.',
  },
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
