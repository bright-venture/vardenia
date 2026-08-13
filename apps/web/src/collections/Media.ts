import type { CollectionConfig } from 'payload'
import { anyone, isStaff } from '../access/index'
import { blockMediaInUse } from '../hooks/blockMediaInUse'

/**
 * Photography is the product for a luxury title, so the image sizes here are
 * generous and the alt text is required - an inaccessible premium magazine is
 * still an inaccessible magazine, and Google reads alt text on every listing.
 */
const WEBP = { format: 'webp', options: { quality: 82 } } as const

export const Media: CollectionConfig = {
  slug: 'media',
  admin: { group: 'Content' },
  access: {
    read: anyone,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  hooks: {
    beforeDelete: [blockMediaInUse],
  },
  upload: {
    // Storage adapter is swapped to S3/R2 in payload.config.ts when configured.
    staticDir: 'public/media',
    /**
     * Listed explicitly rather than `image/*`.
     *
     * That wildcard included `image/svg+xml`, and an SVG is a document that can
     * carry `<script>`. Any staff account - or anyone who obtains one - could
     * upload stored XSS. The only thing preventing it from running against
     * Vardenia was that uploads happen to be served from supabase.co rather
     * than our own domain, which is a coincidence of the storage choice and not
     * a control anyone decided on.
     *
     * These are the formats sharp actually processes into the sizes declared
     * below, plus mp4 for video and PDF for an issue's digital edition. Note
     * that HEIC, which is what an iPhone produces by default, is absent: it
     * would need a sharp build with libheif. Editors shooting on a phone should
     * export JPEG.
     */
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'video/mp4',
      'application/pdf',
    ],
    focalPoint: true,
    // `formatOptions` below converts the original only. Each size needs its own
    // copy or it keeps the source format, which quietly gave us JPEG thumbnails
    // off a WebP original - the sizes are what actually get served, so that is
    // the whole saving lost.
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, position: 'centre', formatOptions: WEBP },
      { name: 'card', width: 800, height: 600, position: 'centre', formatOptions: WEBP },
      { name: 'portrait', width: 900, height: 1200, position: 'centre', formatOptions: WEBP },
      { name: 'hero', width: 2000, height: 1125, position: 'centre', formatOptions: WEBP },
      { name: 'og', width: 1200, height: 630, position: 'centre', formatOptions: WEBP },
    ],
    formatOptions: WEBP,
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
