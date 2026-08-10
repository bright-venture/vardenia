/**
 * Shared SEO group. Localized, because an Arabic meta description is not a
 * translation job we want to do at render time.
 */

import type { Field } from 'payload'

export const seoField: Field = {
  name: 'seo',
  type: 'group',
  admin: { position: 'sidebar' },
  fields: [
    {
      name: 'title',
      type: 'text',
      localized: true,
      maxLength: 70,
      admin: { description: 'Falls back to the document title when empty.' },
    },
    {
      name: 'description',
      type: 'textarea',
      localized: true,
      maxLength: 160,
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Open Graph image. Falls back to the hero image.' },
    },
    {
      name: 'noIndex',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Hide this page from search engines.' },
    },
  ],
}
