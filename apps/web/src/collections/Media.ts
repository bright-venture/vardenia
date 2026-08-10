import type { CollectionConfig } from 'payload'
import { anyone, isStaff } from '../access/index'

/**
 * Photography is the product for a luxury title, so the image sizes here are
 * generous and the alt text is required - an inaccessible premium magazine is
 * still an inaccessible magazine, and Google reads alt text on every listing.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  admin: { group: 'Content' },
  access: {
    read: anyone,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  upload: {
    // Storage adapter is swapped to S3/R2 in payload.config.ts when configured.
    staticDir: 'public/media',
    mimeTypes: ['image/*', 'video/mp4', 'application/pdf'],
    focalPoint: true,
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, position: 'centre' },
      { name: 'card', width: 800, height: 600, position: 'centre' },
      { name: 'portrait', width: 900, height: 1200, position: 'centre' },
      { name: 'hero', width: 2000, height: 1125, position: 'centre' },
      { name: 'og', width: 1200, height: 630, position: 'centre' },
    ],
    formatOptions: { format: 'webp', options: { quality: 82 } },
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      localized: true,
      admin: { description: 'Describe the image for screen readers and search engines.' },
    },
    { name: 'caption', type: 'text', localized: true },
    {
      name: 'credit',
      type: 'text',
      admin: { description: 'Photographer or rights holder. Required for licensed imagery.' },
    },
    {
      name: 'usageRights',
      type: 'select',
      defaultValue: 'owned',
      options: [
        { label: 'Owned by Vardenia', value: 'owned' },
        { label: 'Licensed', value: 'licensed' },
        { label: 'Supplied by business', value: 'supplied' },
      ],
      admin: {
        description:
          'Track this. Reusing a supplied photo in a paid ad without rights is a real liability.',
      },
    },
  ],
}
